import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from "npm:pdf-lib@1.17.1";

// Metadata-only embedded-photo probe for post-inspection PDF imports.
// This module does not upload files or write to Storage or the database.

function multiplyPdfMatrices(left, right) {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

function tokenizePdfContent(source) {
  const tokens = [];
  let index = 0;

  const isWhitespace = (char) =>
    char === "\u0000" || char === "\t" || char === "\n" ||
    char === "\f" || char === "\r" || char === " ";

  const isDelimiter = (char) =>
    !char || isWhitespace(char) || "()<>[]{}/%".includes(char);

  while (index < source.length) {
    const char = source[index];

    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    if (char === "%") {
      while (
        index < source.length &&
        source[index] !== "\r" &&
        source[index] !== "\n"
      ) index += 1;
      continue;
    }

    if (char === "(") {
      let depth = 1;
      index += 1;
      while (index < source.length && depth > 0) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === "(") depth += 1;
        else if (source[index] === ")") depth -= 1;
        index += 1;
      }
      tokens.push({ type: "other" });
      continue;
    }

    if (char === "<") {
      if (source[index + 1] === "<") {
        tokens.push({ type: "operator", value: "<<" });
        index += 2;
        continue;
      }
      index += 1;
      while (index < source.length && source[index] !== ">") index += 1;
      index += 1;
      tokens.push({ type: "other" });
      continue;
    }

    if (char === ">" && source[index + 1] === ">") {
      tokens.push({ type: "operator", value: ">>" });
      index += 2;
      continue;
    }

    if (char === "/") {
      const start = ++index;
      while (index < source.length && !isDelimiter(source[index])) index += 1;
      tokens.push({ type: "name", value: source.slice(start, index) });
      continue;
    }

    if ("[]{}".includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    const start = index;
    while (index < source.length && !isDelimiter(source[index])) index += 1;
    const value = source.slice(start, index);

    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
      tokens.push({ type: "number", value: Number(value) });
    } else {
      tokens.push({ type: "operator", value });
    }
  }

  return tokens;
}

function imagePlacementsFromContent(source, pageHeight) {
  let matrix = [1, 0, 0, 1, 0, 0];
  const matrixStack = [];
  let operands = [];
  const placements = [];

  for (const token of tokenizePdfContent(source)) {
    if (token.type === "number" || token.type === "name") {
      operands.push(token);
      continue;
    }

    const operator = token.value;

    if (operator === "q") {
      matrixStack.push([...matrix]);
    } else if (operator === "Q") {
      matrix = matrixStack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (operator === "cm") {
      const values = operands.slice(-6);
      if (values.length === 6 && values.every((value) => value.type === "number")) {
        matrix = multiplyPdfMatrices(matrix, values.map((value) => value.value));
      }
    } else if (operator === "Do") {
      const name = [...operands].reverse().find((value) => value.type === "name");
      if (name) {
        const [a, b, c, d, e, f] = matrix;
        const points = [[0, 0], [1, 0], [0, 1], [1, 1]].map(
          ([x, y]) => [a * x + c * y + e, b * x + d * y + f]
        );
        const xs = points.map((point) => point[0]);
        const ys = points.map((point) => point[1]);
        const x0 = Math.min(...xs);
        const x1 = Math.max(...xs);
        const pdfY0 = Math.min(...ys);
        const pdfY1 = Math.max(...ys);

        placements.push({
          resource_name: name.value,
          display_x: x0,
          display_y: pageHeight - pdfY1,
          display_width: x1 - x0,
          display_height: pdfY1 - pdfY0,
        });
      }
    }

    operands = [];
  }

  return placements;
}

function pdfNumber(dict, key) {
  const value = dict.lookupMaybe(PDFName.of(key), PDFNumber);
  return value ? value.asNumber() : 0;
}

function pdfNameList(value) {
  if (value instanceof PDFName) return [value.decodeText()];
  if (value instanceof PDFArray) {
    const names = [];
    for (let index = 0; index < value.size(); index++) {
      const name = value.lookupMaybe(index, PDFName);
      if (name) names.push(name.decodeText());
    }
    return names;
  }
  return [];
}

function decodedPageContent(page) {
  const contents = page.node.Contents();
  const streams = [];

  if (contents instanceof PDFRawStream) {
    streams.push(contents);
  } else if (contents instanceof PDFArray) {
    for (let index = 0; index < contents.size(); index++) {
      const stream = contents.lookup(index);
      if (stream instanceof PDFRawStream) streams.push(stream);
    }
  }

  const decoder = new TextDecoder("latin1");
  return streams
    .map((stream) => decoder.decode(decodePDFRawStream(stream).decode()))
    .join("\n");
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function extractEmbeddedPhotoMetadata(
  pdfBytes,
  positionedPages,
  parseQuestionHeader,
  observations = []
) {
  const document = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });

  const pages = document.getPages();
  const placementPages = [];
  let allImagePlacements = 0;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const resources = page.node.Resources();
    const xObjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    const imageResources = new Map();

    if (xObjects) {
      for (const [key, reference] of xObjects.entries()) {
        const object = document.context.lookup(reference);
        if (!(object instanceof PDFRawStream)) continue;

        const subtype = object.dict.lookupMaybe(PDFName.of("Subtype"), PDFName);
        if (subtype?.decodeText() !== "Image") continue;

        const filters = pdfNameList(object.dict.lookup(PDFName.of("Filter")));
        imageResources.set(key.decodeText(), {
          filters,
          width: pdfNumber(object.dict, "Width"),
          height: pdfNumber(object.dict, "Height"),
          bytes: object.getContents(),
        });
      }
    }

    const placements = imagePlacementsFromContent(
      decodedPageContent(page),
      page.getHeight()
    )
      .filter((placement) => imageResources.has(placement.resource_name))
      .map((placement) => ({
        ...placement,
        ...imageResources.get(placement.resource_name),
      }))
      .sort((left, right) =>
        left.display_y - right.display_y || left.display_x - right.display_x
      );

    allImagePlacements += placements.length;
    placementPages.push(placements);
  }

  const observationsByQuestion = new Map();

  for (
    const observation of
      Array.isArray(observations) ? observations : []
  ) {
    const observationType =
      String(observation?.obs_type || "").trim();

    if (
      observationType !== "negative" &&
      observationType !== "largely"
    ) {
      continue;
    }

    const questionNo =
      String(observation?.question_base || "").trim();

    if (!questionNo) continue;

    const candidates =
      observationsByQuestion.get(questionNo) || [];

    candidates.push({
      question_no: questionNo,
      question_full: observation?.question_full || null,
      obs_type: observationType,
      finding_kind: observation?.finding_kind || null,
      designation: observation?.designation || null,
      positive_rank: observation?.positive_rank || null,
      nature_of_concern: observation?.nature_of_concern || null,
      classification_coding: observation?.classification_coding || null,
      observation_text: observation?.observation_text || null,
      page_hint: observation?.page_hint || null,
      source_excerpt: observation?.source_excerpt || null,
      confidence: observation?.confidence ?? null,
    });

    observationsByQuestion.set(questionNo, candidates);
  }

  let activeQuestion = null;
  const photos = [];
  const warnings = [];
  const eligiblePhotoPayloads = [];

  let likelyPhotoPlacements = 0;
  let unassignedPhotos = 0;
  let unsupportedPhotos = 0;
  let ignoredImages = 0;
  let inspectorUploadedPhotos = 0;
  let operatorUploadedPhotos = 0;
  let eligiblePhotos = 0;
  let excludedPhotos = 0;
  let manualReviewPhotos = 0;

  for (
    let pageIndex = 0;
    pageIndex < placementPages.length;
    pageIndex++
  ) {
    const positioned =
      positionedPages[pageIndex] || { lines: [] };

    const events = [];

    for (const line of positioned.lines || []) {
      const lineText =
        String(line.text || "").trim();

      const question =
        parseQuestionHeader(lineText);

      if (question) {
        events.push({
          type: "question",
          y_top: Number(line.y_top || 0),
          question_no: question.qno,
        });
      } else if (
        /^Inspector uploaded photos$/i.test(lineText)
      ) {
        events.push({
          type: "photo_section",
          y_top: Number(line.y_top || 0),
          photo_source: "inspector_uploaded",
          photo_heading: lineText,
        });
      } else if (
        /^Operator uploaded photos$/i.test(lineText)
      ) {
        events.push({
          type: "photo_section",
          y_top: Number(line.y_top || 0),
          photo_source: "operator_uploaded",
          photo_heading: lineText,
        });
      }
    }

    for (
      const placement of
        placementPages[pageIndex]
    ) {
      events.push({
        type: "image",
        y_top: placement.display_y,
        placement,
      });
    }

    const eventOrder = {
      question: 0,
      photo_section: 1,
      image: 2,
    };

    events.sort(
      (left, right) =>
        left.y_top - right.y_top ||
        eventOrder[left.type] -
          eventOrder[right.type]
    );

    let pagePhotoIndex = 0;

    for (const event of events) {
      if (event.type === "question") {
        activeQuestion = {
          question_no: event.question_no,
          photo_source: null,
          photo_heading: null,
        };
        continue;
      }

      if (event.type === "photo_section") {
        if (activeQuestion) {
          activeQuestion.photo_source =
            event.photo_source;
          activeQuestion.photo_heading =
            event.photo_heading;
        }
        continue;
      }

      const image = event.placement;

      const likelyPhoto =
        image.width >= 300 &&
        image.height >= 300 &&
        image.width * image.height >= 250000 &&
        image.display_width >= 70 &&
        image.display_height >= 60;

      if (!likelyPhoto) {
        ignoredImages += 1;
        continue;
      }

      likelyPhotoPlacements += 1;

      if (
        !activeQuestion ||
        !activeQuestion.photo_source
      ) {
        unassignedPhotos += 1;

        warnings.push(
          `Page ${pageIndex + 1}: likely photo ` +
          `${image.resource_name} was not inside ` +
          `an Inspector or Operator uploaded photos block.`
        );

        continue;
      }

      pagePhotoIndex += 1;

      const directJpeg =
        image.filters.length === 1 &&
        image.filters[0] === "DCTDecode";

      if (!directJpeg) {
        unsupportedPhotos += 1;

        warnings.push(
          `Page ${pageIndex + 1} / ` +
          `${activeQuestion.question_no}: ` +
          `unsupported image filters ` +
          `${image.filters.join(", ") || "none"}.`
        );

        continue;
      }

      const photoSource =
        activeQuestion.photo_source;

      const observationCandidates =
        observationsByQuestion.get(
          activeQuestion.question_no
        ) || [];

      let eligibilityStatus = "excluded";
      let exclusionReason = null;
      let associationStatus = "not_applicable";

      if (photoSource === "operator_uploaded") {
        operatorUploadedPhotos += 1;
        excludedPhotos += 1;
        exclusionReason =
          "operator_uploaded_photo";
        associationStatus =
          "excluded_by_source";
      } else {
        inspectorUploadedPhotos += 1;

        if (observationCandidates.length === 1) {
          eligiblePhotos += 1;
          eligibilityStatus = "eligible";
          associationStatus =
            "exact_question_single_finding";
        } else if (
          observationCandidates.length === 0
        ) {
          excludedPhotos += 1;
          exclusionReason =
            "no_negative_or_largely_observation";
          associationStatus =
            "no_matching_finding";
        } else {
          manualReviewPhotos += 1;
          eligibilityStatus = "manual_review";
          exclusionReason =
            "multiple_negative_or_largely_observations";
          associationStatus =
            "ambiguous_multiple_findings";

          warnings.push(
            `Page ${pageIndex + 1} / ` +
            `${activeQuestion.question_no}: ` +
            `inspector photo requires manual review ` +
            `because ${observationCandidates.length} ` +
            `Negative/LAE findings were extracted ` +
            `for the question.`
          );
        }
      }

      const contentSha256 =
        await sha256Hex(image.bytes);

      const photoMetadata = {
        question_no: activeQuestion.question_no,
        source_page: pageIndex + 1,
        page_image_index: pagePhotoIndex,
        source_kind: photoSource,
        source_heading:
          activeQuestion.photo_heading,
        eligibility_status:
          eligibilityStatus,
        exclusion_reason:
          exclusionReason,
        association_status:
          associationStatus,
        observation_match_count:
          observationCandidates.length,
        observation_candidates:
          observationCandidates,
        resource_name: image.resource_name,
        mime_type: "image/jpeg",
        size_bytes: image.bytes.length,
        width: image.width,
        height: image.height,
        display_x:
          Number(image.display_x.toFixed(3)),
        display_y:
          Number(image.display_y.toFixed(3)),
        display_width:
          Number(image.display_width.toFixed(3)),
        display_height:
          Number(image.display_height.toFixed(3)),
        content_sha256:
          contentSha256,
        sort_index: photos.length,
      };

      photos.push(photoMetadata);

      if (
        photoSource === "inspector_uploaded" &&
        eligibilityStatus === "eligible" &&
        associationStatus ===
          "exact_question_single_finding"
      ) {
        eligiblePhotoPayloads.push({
          photo: photoMetadata,
          bytes: image.bytes.slice(),
        });
      }
    }
  }

  return {
    counts: {
      all_image_placements:
        allImagePlacements,
      likely_photo_placements:
        likelyPhotoPlacements,
      photos_assigned_supported:
        photos.length,
      photos_inspector_uploaded:
        inspectorUploadedPhotos,
      photos_operator_uploaded:
        operatorUploadedPhotos,
      photos_eligible:
        eligiblePhotos,
      photos_excluded:
        excludedPhotos,
      photos_manual_review:
        manualReviewPhotos,
      photos_unassigned:
        unassignedPhotos,
      photos_unsupported:
        unsupportedPhotos,
      images_ignored_as_non_photos:
        ignoredImages,
      warnings_count:
        warnings.length,
    },
    photos,
    warnings,
    eligible_photo_payloads:
      eligiblePhotoPayloads,
  };
}
