import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function App() {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const ocrWorkerRef = useRef(null);
  const ocrLanguageRef = useRef(null);

  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1.5);

  const [selectedText, setSelectedText] = useState("");
  const [popupPosition, setPopupPosition] = useState(null);

  const [translationText, setTranslationText] = useState("");
const [translationResult, setTranslationResult] = useState(null);
const [translationOpen, setTranslationOpen] = useState(false);

  const [language, setLanguage] = useState("da-DK");
  const [ocrLoading, setOcrLoading] = useState(false);

  const getOcrLanguage = (currentLanguage) => {
    if (currentLanguage === "en-US") return "eng";
    if (currentLanguage === "ko-KR") return "kor";
    if (currentLanguage === "ja-JP") return "jpn";
    return "dan";
  };

  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  // =========================
// 번역
// =========================

useEffect(() => {
  if (!translationText.trim()) return;

  const translateText = async () => {
    try {
      setTranslationResult(null);

      const response = await fetch(
        "http://localhost:3001/api/translate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: translationText.trim(),
            language: language,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setTranslationResult({
          error:
            data.error ||
            "번역을 불러오지 못했습니다.",
        });

        return;
      }

      setTranslationResult(data);

    } catch (error) {
      console.error(
        "Translation error:",
        error
      );

      setTranslationResult({
        error:
          "번역 서버에 연결할 수 없습니다.",
      });
    }
  };

  translateText();
}, [translationText, language]);

  // =========================
  // PDF 글자 선택
  // =========================

  useEffect(() => {
  const handleSelectionChange = () => {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      setSelectedText("");
      setPopupPosition(null);
      return;
    }

    const text = selection.toString();

    if (!text.trim()) {
      setSelectedText("");
      setPopupPosition(null);
      return;
    }

    const selectedNode = selection.anchorNode;

    if (!selectedNode) return;

    const selectedElement =
      selectedNode.nodeType === Node.TEXT_NODE
        ? selectedNode.parentElement
        : selectedNode;

    if (!selectedElement?.closest(".text-layer")) {
      return;
    }

    const selectionRange = selection.getRangeAt(0);
    const rect = selectionRange.getBoundingClientRect();

    setSelectedText(text);
setTranslationOpen(true);

    setPopupPosition({
      left: rect.left + rect.width / 2,
      top: rect.top - 10,
    });
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      return;
    }

    const text = selection.toString().trim();

    if (!text) return;

    const selectedNode = selection.anchorNode;

    if (!selectedNode) return;

    const selectedElement =
      selectedNode.nodeType === Node.TEXT_NODE
        ? selectedNode.parentElement
        : selectedNode;

    if (!selectedElement?.closest(".text-layer")) {
      return;
    }

    // 드래그가 끝난 순간 딱 한 번 사전 검색
    setTranslationText(text);
  };

  document.addEventListener(
    "selectionchange",
    handleSelectionChange
  );

  document.addEventListener(
    "mouseup",
    handleMouseUp
  );

  return () => {
    document.removeEventListener(
      "selectionchange",
      handleSelectionChange
    );

    document.removeEventListener(
      "mouseup",
      handleMouseUp
    );
  };
}, []);

  // =========================
  // 확대 / 축소
  // =========================

  const zoomIn = () => {
    setScale((current) => Math.min(current + 0.375, 3));
  };

  const zoomOut = () => {
    setScale((current) => Math.max(current - 0.375, 0.75));
  };

  // =========================
  // 페이지 이동
  // =========================

  const goToPage = (value) => {
    if (!pdf) return;

    const number = Number(value);

    if (!Number.isFinite(number)) {
      setPageInput(String(pageNumber));
      return;
    }

    const nextPage = Math.min(
      pdf.numPages,
      Math.max(1, Math.floor(number))
    );

    setPageNumber(nextPage);
    setPageInput(String(nextPage));
    setSelectedText("");
    setPopupPosition(null);
  };

  // =========================
  // OCR
  // =========================

  const runOcr = async (canvas) => {
    setOcrLoading(true);

    try {
      const ocrLanguage = getOcrLanguage(language);

      if (
        !ocrWorkerRef.current ||
        ocrLanguageRef.current !== ocrLanguage
      ) {
        if (ocrWorkerRef.current) {
          await ocrWorkerRef.current.terminate();
        }

        ocrWorkerRef.current =
          await createWorker(ocrLanguage);

        ocrLanguageRef.current = ocrLanguage;
      }

      const worker = ocrWorkerRef.current;

      const result = await worker.recognize(
        canvas,
        {},
        {
          blocks: true,
          text: true,
        }
      );

      const textLayer = textLayerRef.current;

      if (!textLayer) return;

      textLayer.innerHTML = "";

      const blocks = result?.data?.blocks;

      if (blocks && blocks.length > 0) {
        blocks.forEach((block) => {
          block.paragraphs?.forEach((paragraph) => {
            paragraph.lines?.forEach((line) => {
              line.words?.forEach((word) => {
                if (!word.text?.trim()) return;

                const span =
                  document.createElement("span");

                span.textContent = word.text + " ";

                const x = word.bbox?.x0 ?? 0;
                const y = word.bbox?.y0 ?? 0;
                const x1 = word.bbox?.x1 ?? x + 10;
                const y1 = word.bbox?.y1 ?? y + 10;

                const width = x1 - x;
                const height = y1 - y;

                span.style.position = "absolute";
                span.style.left = `${x}px`;
                span.style.top = `${y}px`;
                span.style.width =
                  `${Math.max(width, 10)}px`;
                span.style.height =
                  `${Math.max(height, 10)}px`;
                span.style.fontSize =
                  `${Math.max(height, 10)}px`;
                span.style.fontFamily = "sans-serif";
                span.style.color = "transparent";
                span.style.whiteSpace = "pre";
                span.style.cursor = "text";

                textLayer.appendChild(span);
              });
            });
          });
        });
      } else {
        const text = result?.data?.text?.trim();

        if (text) {
          const span =
            document.createElement("span");

          span.textContent = text;
          span.style.position = "absolute";
          span.style.left = "20px";
          span.style.top = "20px";
          span.style.width = "90%";
          span.style.color = "transparent";
          span.style.fontSize = "18px";
          span.style.lineHeight = "1.5";
          span.style.whiteSpace = "pre-wrap";
          span.style.cursor = "text";

          textLayer.appendChild(span);
        }
      }
    } catch (error) {
      console.error("OCR error:", error);
      alert("OCR 중 오류가 발생했습니다.");
    } finally {
      setOcrLoading(false);
    }
  };

  // =========================
  // PDF 페이지 렌더링
  // =========================

  useEffect(() => {
    if (!pdf) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber);

        if (cancelled) return;

        const viewport = page.getViewport({
          scale: scale,
        });

        const canvas = canvasRef.current;
        const textLayer = textLayerRef.current;

        if (!canvas || !textLayer) return;

        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        canvas.style.width =
          `${viewport.width}px`;
        canvas.style.height =
          `${viewport.height}px`;

        textLayer.innerHTML = "";
        textLayer.style.width =
          `${viewport.width}px`;
        textLayer.style.height =
          `${viewport.height}px`;

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        if (cancelled) return;

        const textContent =
          await page.getTextContent();

        const realText = textContent.items
          .map((item) => item.str)
          .join("")
          .trim();

        if (realText.length > 2) {
  textContent.items.forEach((item) => {
    if (!item.str) return;

    const span = document.createElement("span");

    span.textContent = item.str;

    const tx = pdfjsLib.Util.transform(
      viewport.transform,
      item.transform
    );

    const fontHeight = Math.hypot(tx[2], tx[3]);

    span.style.position = "absolute";
    span.style.left = `${tx[4]}px`;
    span.style.top = `${tx[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = "sans-serif";
    span.style.color = "transparent";
    span.style.whiteSpace = "pre";
    span.style.cursor = "text";

    // 글자의 실제 크기에 맞춰 선택 영역을 넓힘
    const itemWidth =
      Math.abs(tx[0]) || item.width * scale;

    span.style.width = `${itemWidth}px`;
    span.style.height = `${fontHeight}px`;

    textLayer.appendChild(span);
  });
} else {
  await runOcr(canvas);
}
      } catch (error) {
        console.error(
          "Page render error:",
          error
        );

        alert(
          "페이지를 불러오는 중 오류가 발생했습니다."
        );
      }
    };

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale, language]);

  // =========================
  // PDF 파일 열기
  // =========================

  const handleFileChange = async (event) => {
    const file = event.target.files[0];

    if (!file) return;

    try {
      const arrayBuffer =
        await file.arrayBuffer();

      const loadingTask =
        pdfjsLib.getDocument({
          data: arrayBuffer,
        });

      const loadedPdf =
        await loadingTask.promise;

      setPdf(loadedPdf);
      setPageNumber(1);
      setPageInput("1");
      setScale(1.5);
      setSelectedText("");
      setPopupPosition(null);
    } catch (error) {
      console.error("PDF error:", error);
      alert("PDF를 불러오지 못했습니다.");
    }
  };

  // =========================
  // TTS
  // =========================

  const speakText = async () => {
    if (!selectedText) return;

    try {
      const response = await fetch(
        "http://localhost:3001/api/tts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: selectedText,
            language: language,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(data);
        alert("TTS 오류가 발생했습니다.");
        return;
      }

      const audio = new Audio(
        "data:audio/mp3;base64," +
        data.audioContent
      );

      await audio.play();
    } catch (error) {
      console.error(error);
      alert(
        "TTS 서버에 연결할 수 없습니다."
      );
    }
  };

  // =========================
  // 언어 변경
  // =========================

  const changeLanguage = async (newLanguage) => {
    setLanguage(newLanguage);

    if (ocrWorkerRef.current) {
      await ocrWorkerRef.current.terminate();

      ocrWorkerRef.current = null;
      ocrLanguageRef.current = null;
    }
  };

  return (
    <div className="app">
      <h1>PDF Reader</h1>

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
      />
      <div className="app-signature">
  <div className="app-version">v0.1.0</div>
  <div className="app-message">
    테레사에게. 나랑 같이 공부해줘서 고마워요.
  </div>
</div>

      {pdf && (
        <>
          <div className="language-buttons">
            <button
              className={
                language === "en-US"
                  ? "active"
                  : ""
              }
              onClick={() =>
                changeLanguage("en-US")
              }
            >
              English
            </button>

            <button
              className={
                language === "da-DK"
                  ? "active"
                  : ""
              }
              onClick={() =>
                changeLanguage("da-DK")
              }
            >
              Dansk
            </button>

            <button
              className={
                language === "ko-KR"
                  ? "active"
                  : ""
              }
              onClick={() =>
                changeLanguage("ko-KR")
              }
            >
              한국어
            </button>

            <button
              className={
                language === "ja-JP"
                  ? "active"
                  : ""
              }
              onClick={() =>
                changeLanguage("ja-JP")
              }
            >
              日本語
            </button>
          </div>

          <div className="controls">
            <button
              onClick={() => {
                setPageNumber((page) =>
                  Math.max(1, page - 1)
                );

                setSelectedText("");
                setPopupPosition(null);
              }}
              disabled={pageNumber <= 1}
            >
              이전 페이지
            </button>

            <div className="page-number">
              <input
                type="number"
                min="1"
                max={pdf.numPages}
                value={pageInput}
                onChange={(event) => {
                  setPageInput(
                    event.target.value
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    goToPage(pageInput);
                  }
                }}
                onBlur={() => {
                  goToPage(pageInput);
                }}
              />

              <span>
                / {pdf.numPages}
              </span>
            </div>

            <button
              onClick={() => {
                setPageNumber((page) =>
                  Math.min(
                    pdf.numPages,
                    page + 1
                  )
                );

                setSelectedText("");
                setPopupPosition(null);
              }}
              disabled={
                pageNumber >= pdf.numPages
              }
            >
              다음 페이지
            </button>

            <div className="zoom-controls">
              <button
                onClick={zoomOut}
                disabled={scale <= 0.75}
              >
                −
              </button>

              <span>
                {Math.round(
                  (scale / 1.5) * 100
                )}
                %
              </span>

              <button
                onClick={zoomIn}
                disabled={scale >= 3}
              >
                +
              </button>
            </div>
          </div>

          {ocrLoading && (
            <div className="ocr-loading">
              이 페이지의 글자를 읽는 중... 🔍
            </div>
          )}

          <div className="pdf-page">
            <canvas ref={canvasRef} />

            <div
              ref={textLayerRef}
              className="text-layer"
            />
          </div>

          {selectedText &&
            popupPosition && (
              <div
                className="selection-popup"
                style={{
                  left: popupPosition.left,
                  top: popupPosition.top,
                }}
              >
                <span className="popup-text">
                  {selectedText}
                </span>

                <button
                  className="speak-button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={speakText}
                  title="읽어주기"
                >
                  🔊
                </button>
              </div>
            )}

          {translationOpen && (
  <div className="dictionary-panel">
    <h3>🌐 Translation</h3>

    <div className="translation-original">
  <span>{translationText}</span>

  <button
    className="translation-speak-button"
    onClick={speakText}
    title="원문 듣기"
  >
    🔊
  </button>
</div>

    {translationResult?.error ? (
      <p>{translationResult.error}</p>
    ) : translationResult ? (
      <div>
        {translationResult.translations?.map(
          (translation, index) => (
            <div
              key={index}
              className="dictionary-translation"
            >
              <span>{translation.languageName}</span>

              <strong>{translation.text}</strong>
            </div>
          )
        )}
      </div>
    ) : (
      <p>번역하는 중...</p>
    )}
  </div>
)}
        </>
      )}
    </div>
  );
}

export default App;