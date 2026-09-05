import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// =========================
// 기본 설정
// =========================

const DB_NAME = "pdf-reader-db";
const STORE_NAME = "pdfs";

const LANGUAGE_OPTIONS = [
  {
    value: "en-US",
    label: "English",
  },
  {
    value: "da-DK",
    label: "Dansk",
  },
  {
    value: "ko-KR",
    label: "한국어",
  },
  {
    value: "ja-JP",
    label: "日本語",
  },
  {
    value: "fr-FR",
    label: "Français",
  },
];

const getLanguageLabel = (
  language
) => {
  const option =
    LANGUAGE_OPTIONS.find(
      (item) =>
        item.value === language
    );

  return (
    option?.label ||
    language
  );
};

const getLocalDateString = () => {
  const date = new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDateKey = (
  date
) => {
  return (
    date.getFullYear() +
    "-" +
    String(
      date.getMonth() + 1
    ).padStart(2, "0") +
    "-" +
    String(
      date.getDate()
    ).padStart(2, "0")
  );
};

const parseDateKey = (
  dateKey
) => {
  const [
    year,
    month,
    day,
  ] = dateKey
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
};

// =========================
// IndexedDB
// =========================

const openDatabase = () => {
  return new Promise(
    (resolve, reject) => {
      const request =
        indexedDB.open(
          DB_NAME,
          7
        );

      request.onupgradeneeded =
        () => {
          const database =
            request.result;

          const transaction =
            request.transaction;

          if (
            !database.objectStoreNames.contains(
              STORE_NAME
            )
          ) {
            database.createObjectStore(
              STORE_NAME,
              {
                keyPath: "id",
              }
            );
          }

          if (
            !database.objectStoreNames.contains(
              "words"
            )
          ) {
            database.createObjectStore(
              "words",
              {
                keyPath: "id",
              }
            );
          }

          if (
            database.objectStoreNames.contains(
              "pdf-files"
            )
          ) {
            const oldStore =
              transaction.objectStore(
                "pdf-files"
              );

            const newStore =
              transaction.objectStore(
                STORE_NAME
              );

            const oldRequest =
              oldStore.get(
                "current-pdf"
              );

            oldRequest.onsuccess =
              () => {
                const oldPdf =
                  oldRequest.result;

                if (!oldPdf) {
                  return;
                }

                newStore.put({
                  id: crypto.randomUUID(),
                  file: oldPdf.file,
                  name: oldPdf.name,
                  language: "da-DK",
                  lastPage: 1,
                  firstOpenedAt:
                    Date.now(),
                  lastStudiedAt:
                    Date.now(),
                  ocrData: {},
                });
              };
          }
        };

      request.onsuccess =
        () => {
          resolve(
            request.result
          );
        };

      request.onerror = () => {
        reject(
          request.error
        );
      };
    }
  );
};

// =========================
// PDF 저장
// =========================

const savePdfToDatabase =
  async (
    file,
    language
  ) => {
    const database =
      await openDatabase();

    const pdfData = {
      id: crypto.randomUUID(),

      file,

      name: file.name,

      language,

      lastPage: 1,

      firstOpenedAt:
        Date.now(),

      lastStudiedAt:
        Date.now(),

      ocrData: {},
    };

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readwrite"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        store.put(
          pdfData
        );

        transaction.oncomplete =
          () => {
            database.close();

            resolve(
              pdfData
            );
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// PDF 가져오기
// =========================

const getPdfsFromDatabase =
  async () => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readonly"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            database.close();

            resolve(
              request.result || []
            );
          };

        request.onerror = () => {
          database.close();

          reject(
            request.error
          );
        };
      }
    );
  };

// =========================
// PDF 언어 저장
// =========================

const updatePdfLanguage =
  async (
    pdfId,
    language
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readwrite"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        const request =
          store.get(pdfId);

        request.onsuccess =
          () => {
            const pdfData =
              request.result;

            if (!pdfData) {
              return;
            }

            pdfData.language =
              language;

            store.put(
              pdfData
            );
          };

        request.onerror = () => {
          reject(
            request.error
          );
        };

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// PDF 삭제
// =========================

const deletePdfFromDatabase =
  async (
    pdfId
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            [
              STORE_NAME,
              "words",
            ],
            "readwrite"
          );

        const pdfStore =
          transaction.objectStore(
            STORE_NAME
          );

        const wordStore =
          transaction.objectStore(
            "words"
          );

        pdfStore.delete(
          pdfId
        );

        const wordRequest =
          wordStore.getAll();

        wordRequest.onsuccess =
          () => {
            const words =
              wordRequest.result ||
              [];

            words
              .filter(
                (word) =>
                  word.pdfId ===
                  pdfId
              )
              .forEach(
                (word) => {
                  wordStore.delete(
                    word.id
                  );
                }
              );
          };

        wordRequest.onerror =
          () => {
            reject(
              wordRequest.error
            );
          };

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// 마지막 페이지 저장
// =========================

const saveLastPageToDatabase =
  async (
    pdfId,
    lastPage
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readwrite"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        const request =
          store.get(pdfId);

        request.onsuccess =
          () => {
            const pdfData =
              request.result;

            if (!pdfData) {
              return;
            }

            pdfData.lastPage =
              lastPage;

            pdfData.lastStudiedAt =
              Date.now();

            store.put(
              pdfData
            );
          };

        request.onerror =
          () => {
            reject(
              request.error
            );
          };

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// OCR 저장
// =========================

const saveOcrDataToDatabase =
  async (
    pdfId,
    pageNumber,
    ocrLanguage,
    words,
    scale
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            STORE_NAME,
            "readwrite"
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        const request =
          store.get(pdfId);

        request.onsuccess =
          () => {
            const pdfData =
              request.result;

            if (!pdfData) {
              return;
            }

            if (!pdfData.ocrData) {
              pdfData.ocrData = {};
            }

            if (
              !pdfData.ocrData[
                ocrLanguage
              ]
            ) {
              pdfData.ocrData[
                ocrLanguage
              ] = {};
            }

            pdfData.ocrData[
              ocrLanguage
            ][pageNumber] = {
              words,
              scale,
            };

            store.put(
              pdfData
            );
          };

        request.onerror =
          () => {
            reject(
              request.error
            );
          };

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// 단어 저장
// =========================

const saveWordToDatabase =
  async ({
    word,
    language,
    pdfId,
    originalForm,
    displayForm,
    meaning = "",
    note = "",
  }) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readwrite"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            const words =
              request.result || [];

            const existingWord =
              words.find(
                (item) =>
                  item.word === word &&
                  item.language ===
                    language &&
                  item.pdfId ===
                    pdfId
              );

            const now =
              Date.now();

            const today =
              getLocalDateString();

            if (existingWord) {
              if (
                !existingWord.history
              ) {
                existingWord.history =
                  {};
              }

              if (
                !existingWord.history[
                  today
                ]
              ) {
                existingWord.history[
                  today
                ] = {
                  seenCount: 0,
                  playCount: 0,
                };
              }

              existingWord.lastSeenAt =
                now;

              if (meaning) {
                existingWord.meaning =
                  meaning;
              }

              existingWord.seenCount =
                (existingWord.seenCount ||
                  0) +
                1;

              existingWord.history[
                today
              ].seenCount += 1;

              store.put(
                existingWord
              );

              return;
            }

            const newWord = {
              id: crypto.randomUUID(),

              word,
              language,
              pdfId,

              originalForm,
              displayForm,

              meaning,
              note,

              firstSeenAt: now,
              lastSeenAt: now,
              seenCount: 1,

              playCount: 0,
              lastPlayedAt: null,

              wordbookPlayCount: 0,
              lastWordbookPlayedAt:
                null,

              isStarred: false,
              starredAt: null,

              history: {
                [today]: {
                  seenCount: 1,
                  playCount: 0,
                },
              },
            };

            store.put(
              newWord
            );
          };

        request.onerror =
          () => {
            database.close();

            reject(
              request.error
            );
          };

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// 단어 발음 기록
// =========================

const recordWordPlayToDatabase =
  async (
    word,
    language,
    pdfId,
    selectedDate
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readwrite"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            const words =
              request.result || [];

            const existingWord =
              words.find(
                (item) =>
                  item.word === word &&
                  item.language ===
                    language &&
                  item.pdfId ===
                    pdfId
              );

            if (!existingWord) {
              return;
            }

            const now =
              Date.now();

            const targetDate =
              selectedDate ||
              getLocalDateString();

            existingWord.playCount =
              (existingWord.playCount ||
                0) +
              1;

            existingWord.lastPlayedAt =
              now;

            if (
              !existingWord.history
            ) {
              existingWord.history =
                {};
            }

            if (
              !existingWord.history[
                targetDate
              ]
            ) {
              existingWord.history[
                targetDate
              ] = {
                seenCount: 0,
                playCount: 0,
              };
            }

            existingWord.history[
              targetDate
            ].playCount =
              (existingWord.history[
                targetDate
              ].playCount || 0) + 1;

            store.put(
              existingWord
            );
          };

        request.onerror =
          () => {
            database.close();

            reject(
              request.error
            );
          };

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// 단어장 발음 기록
// =========================

const recordWordbookPlayToDatabase =
  async (
    wordId
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readwrite"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.get(wordId);

        request.onsuccess =
          () => {
            const word =
              request.result;

            if (!word) {
              return;
            }

            word.wordbookPlayCount =
              (word.wordbookPlayCount ||
                0) +
              1;

            word.lastWordbookPlayedAt =
              Date.now();

            store.put(
              word
            );
          };

        request.onerror =
          () => {
            reject(
              request.error
            );
          };

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// ⭐ 단어장 별표 변경
// =========================

const toggleWordStarInDatabase =
  async (
    wordId
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readwrite"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.get(wordId);

        request.onsuccess =
          () => {
            const word =
              request.result;

            if (!word) {
              return;
            }

            if (
              word.isStarred
            ) {
              word.isStarred =
                false;

              word.starredAt =
                null;
            } else {
              word.isStarred =
                true;

              word.starredAt =
                Date.now();
            }

            store.put(
              word
            );
          };

        request.onerror =
          () => {
            reject(
              request.error
            );
          };

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

// =========================
// 선택한 날짜의 전체 PDF 단어
// =========================

const getTodayWordsFromDatabase =
  async (
    pdfId,
    language,
    selectedDate
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readonly"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            const words =
              (
                request.result ||
                []
              )
                .filter(
                  (item) =>
                    item.language ===
                      language &&
                    item.history?.[
                      selectedDate
                    ]
                )
                .sort(
                  (a, b) =>
                    a.firstSeenAt -
                    b.firstSeenAt
                );

            database.close();

            resolve(
              words
            );
          };

        request.onerror =
          () => {
            database.close();

            reject(
              request.error
            );
          };
      }
    );
  };

// =========================
// 선택한 언어의 날짜별 전체 단어
// =========================

const getWordsForDateFromDatabase =
  async (
    language,
    selectedDate
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readonly"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            const words =
              (
                request.result ||
                []
              )
                .filter(
                  (item) =>
                    item.language ===
                      language &&
                    item.history?.[
                      selectedDate
                    ]
                )
                .sort(
                  (a, b) =>
                    a.firstSeenAt -
                    b.firstSeenAt
                );

            database.close();

            resolve(
              words
            );
          };

        request.onerror =
          () => {
            database.close();

            reject(
              request.error
            );
          };
      }
    );
  };

// =========================
// 선택한 언어의 월별 단어
// =========================

const getWordsForMonthFromDatabase =
  async (
    language,
    year,
    monthIndex
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readonly"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            const words =
  (
    request.result ||
    []
  ).filter(
    (word) =>
      word.language ===
      language
  );

            const monthPrefix =
              `${year}-${String(
                monthIndex + 1
              ).padStart(
                2,
                "0"
              )}`;

            const result = [];

            words.forEach(
              (word) => {
                if (
                  word.language !==
                  language
                ) {
                  return;
                }

                if (
                  !word.history
                ) {
                  return;
                }

                Object.entries(
                  word.history
                ).forEach(
                  ([
                    date,
                    history,
                  ]) => {
                    if (
                      !date.startsWith(
                        monthPrefix
                      )
                    ) {
                      return;
                    }

                    if (
                      (history?.seenCount ||
                        0) <= 0 &&
                      (history?.playCount ||
                        0) <= 0
                    ) {
                      return;
                    }

                    result.push({
                      ...word,
                      studyDate:
                        date,
                    });
                  }
                );
              }
            );

            result.sort(
              (a, b) => {
                if (
                  a.studyDate !==
                  b.studyDate
                ) {
                  return a.studyDate.localeCompare(
                    b.studyDate
                  );
                }

                return (
                  a.firstSeenAt -
                  b.firstSeenAt
                );
              }
            );

            database.close();

            resolve(
              result
            );
          };

        request.onerror =
          () => {
            database.close();

            reject(
              request.error
            );
          };
      }
    );
  };

// =========================
// ⭐ 단어장 가져오기
// =========================

const getWordbookFromDatabase =
  async (
    language,
    sortType
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readonly"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            let words =
              (
                request.result ||
                []
              ).filter(
                (item) =>
                  item.language ===
                    language &&
                  item.isStarred
              );

            if (
              sortType ===
              "newest"
            ) {
              words.sort(
                (a, b) =>
                  (b.starredAt ||
                    0) -
                  (a.starredAt ||
                    0)
              );
            }

            if (
              sortType ===
              "oldest"
            ) {
              words.sort(
                (a, b) =>
                  (a.starredAt ||
                    0) -
                  (b.starredAt ||
                    0)
              );
            }

            if (
              sortType ===
              "mostPlayed"
            ) {
              words.sort(
                (a, b) =>
                  (b.wordbookPlayCount ||
                    0) -
                  (a.wordbookPlayCount ||
                    0)
              );
            }

            if (
              sortType ===
              "leastPlayed"
            ) {
              words.sort(
                (a, b) =>
                  (a.wordbookPlayCount ||
                    0) -
                  (b.wordbookPlayCount ||
                    0)
              );
            }

            if (
              sortType ===
              "random"
            ) {
              words =
                [...words].sort(
                  () =>
                    Math.random() -
                    0.5
                );
            }

            database.close();

            resolve(
              words
            );
          };

        request.onerror =
          () => {
            database.close();

            reject(
              request.error
            );
          };
      }
    );
  };

// =========================
// 학습 날짜 가져오기
// =========================

const getStudyDatesFromDatabase =
  async (
    language
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readonly"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        const request =
          store.getAll();

        request.onsuccess =
          () => {
            const dates =
              new Set();

            (
              request.result ||
              []
            )
              .filter(
                (word) =>
                  word.language ===
                  language
              )
              .forEach(
                (word) => {
                  if (
                    !word.history
                  ) {
                    return;
                  }

                  Object.entries(
                    word.history
                  ).forEach(
                    ([
                      date,
                      history,
                    ]) => {
                      if (
                        (history?.seenCount ||
                          0) > 0 ||
                        (history?.playCount ||
                          0) > 0
                      ) {
                        dates.add(
                          date
                        );
                      }
                    }
                  );
                }
              );

            database.close();

            resolve(
              Array.from(
                dates
              )
            );
          };

        request.onerror = () => {
          database.close();

          reject(
            request.error
          );
        };
      }
    );
  };

// =========================
// 단어 삭제
// =========================

const deleteWordFromDatabase =
  async (
    wordId
  ) => {
    const database =
      await openDatabase();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        const transaction =
          database.transaction(
            "words",
            "readwrite"
          );

        const store =
          transaction.objectStore(
            "words"
          );

        store.delete(
          wordId
        );

        transaction.oncomplete =
          () => {
            database.close();

            resolve();
          };

        transaction.onerror =
          () => {
            database.close();

            reject(
              transaction.error
            );
          };
      }
    );
  };

function App() {
  const [adminPassword, setAdminPassword] =
    useState("");
  const [adminLoggedIn, setAdminLoggedIn] =
    useState(false);
  const [adminError, setAdminError] =
    useState("");
  const [adminLoading, setAdminLoading] =
    useState(false);
  const [ttsUsage, setTtsUsage] =
    useState(null);
  const [translateUsage, setTranslateUsage] =
    useState(null);

  const canvasRef =
    useRef(null);

  const textLayerRef =
    useRef(null);

  const ocrWorkerRef =
    useRef(null);

  const renderTaskRef =
    useRef(null);

  const ocrLanguageRef =
    useRef(null);

  const ocrCacheRef =
    useRef(new Map());

  const [
    isInitializing,
    setIsInitializing,
  ] = useState(true);

  const [screen, setScreen] =
    useState("home");

  useEffect(() => {
    if (isInitializing) {
      return;
    }

    localStorage.setItem(
      "pdf-reader-screen",
      screen
    );
  }, [screen, isInitializing]);

  const [pdf, setPdf] =
    useState(null);

  const [pdfFile, setPdfFile] =
    useState(null);

  const [
    rememberedPdf,
    setRememberedPdf,
  ] = useState(null);

  const [
    rememberedPdfs,
    setRememberedPdfs,
  ] = useState([]);

  const [
    openBookMenuId,
    setOpenBookMenuId,
  ] = useState(null);

  const [
    todayWordMenu,
    setTodayWordMenu,
  ] = useState(null);

  const [
    coverImages,
    setCoverImages,
  ] = useState({});

  const [
    pageNumber,
    setPageNumber,
  ] = useState(1);

  const [
    pageInput,
    setPageInput,
  ] = useState("1");

  const [scale, setScale] =
    useState(1.5);

  const [
    selectedText,
    setSelectedText,
  ] = useState("");

  const [
    popupPosition,
    setPopupPosition,
  ] = useState(null);

  const [
    translationText,
    setTranslationText,
  ] = useState("");

  const [
    translationResult,
    setTranslationResult,
  ] = useState(null);

  const [
    translationOpen,
    setTranslationOpen,
  ] = useState(true);

  const [ttsText, setTtsText] =
    useState("");

  const [language, setLanguage] =
    useState("da-DK");

  const [
    ocrLoading,
    setOcrLoading,
  ] = useState(false);

  const [
    todayWords,
    setTodayWords,
  ] = useState([]);

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(
    getLocalDateString()
  );

  const [
    studyDates,
    setStudyDates,
  ] = useState([]);

  const [
    calendarMonth,
    setCalendarMonth,
  ] = useState(() => {
    const today =
      new Date();

    return new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );
  });

  const [
    homeDateMode,
    setHomeDateMode,
  ] = useState("date");

  const [
    homeSelectedDate,
    setHomeSelectedDate,
  ] = useState(
    getLocalDateString()
  );

  const [
    homeWords,
    setHomeWords,
  ] = useState([]);

  const [
    homeMonthWords,
    setHomeMonthWords,
  ] = useState([]);

  const [
    wordbookWords,
    setWordbookWords,
  ] = useState([]);

  const [
    wordbookSort,
    setWordbookSort,
  ] = useState(
    "newest"
  );

  const [
  wordbookContextMenu,
  setWordbookContextMenu,
] = useState(null);

useEffect(() => {
  if (
    !wordbookContextMenu
  ) {
    return;
  }

  const closeContextMenu = () => {
    setWordbookContextMenu(
      null
    );
  };

  document.addEventListener(
  "mousedown",
  closeContextMenu
);

  return () => {
    document.removeEventListener(
  "mousedown",
  closeContextMenu
);
  };
}, [
  wordbookContextMenu,
]);

  // =========================
  // 저장된 PDF 불러오기
  // =========================

  useEffect(() => {
    const loadRememberedPdf =
      async () => {
        try {
          let savedPdfs =
            await getPdfsFromDatabase();

          if (
            !savedPdfs ||
            savedPdfs.length === 0
          ) {
            setScreen("home");
            setIsInitializing(
              false
            );

            return;
          }

          const migratedPdfs =
            [];

          for (
            const savedPdf of savedPdfs
          ) {
            if (
              !savedPdf.language
            ) {
              await updatePdfLanguage(
                savedPdf.id,
                "da-DK"
              );

              migratedPdfs.push({
                ...savedPdf,
                language: "da-DK",
              });
            } else {
              migratedPdfs.push(
                savedPdf
              );
            }
          }

          savedPdfs =
            migratedPdfs;

          setRememberedPdfs(
            savedPdfs
          );
const savedCoverImages = {};

for (
  const savedPdf of savedPdfs
) {
  if (savedPdf.coverImage) {
    savedCoverImages[
      savedPdf.id
    ] = savedPdf.coverImage;
  }
}

setCoverImages(
  savedCoverImages
);

          const lastOpenedPdf =
            savedPdfs.reduce(
              (
                latest,
                current
              ) => {
                if (
                  !latest ||
                  (
                    current.lastStudiedAt ||
                    0
                  ) >
                    (
                      latest.lastStudiedAt ||
                      0
                    )
                ) {
                  return current;
                }

                return latest;
              },
              null
            );

          if (
            !lastOpenedPdf
          ) {
            setScreen("home");
            setIsInitializing(
              false
            );

            return;
          }

          setRememberedPdf({
            name:
              lastOpenedPdf.name,

            id:
              lastOpenedPdf.id,
          });

          setLanguage(
            lastOpenedPdf.language ||
              "da-DK"
          );

          setPdfFile(
            lastOpenedPdf.file
          );

          const arrayBuffer =
            await lastOpenedPdf.file.arrayBuffer();

          const loadingTask =
            pdfjsLib.getDocument({
              data: arrayBuffer,
            });

          const loadedPdf =
            await loadingTask.promise;

          setPdf(
            loadedPdf
          );

          const savedPage =
            Math.min(
              lastOpenedPdf.lastPage ||
                1,
              loadedPdf.numPages
            );

          setPageNumber(
            savedPage
          );

          setPageInput(
            String(savedPage)
          );

          setSelectedDate(
  getLocalDateString()
);

const todayWordsFromDatabase =
  await getTodayWordsFromDatabase(
    lastOpenedPdf.id,
    lastOpenedPdf.language || "da-DK",
    getLocalDateString()
  );

setTodayWords(
  todayWordsFromDatabase
);

await createCoverImage(
  loadedPdf,
  lastOpenedPdf.id
);

const savedScreen =
  localStorage.getItem(
    "pdf-reader-screen"
  ) || "home";

setScreen(savedScreen);
        } catch (error) {
          console.error(
            "Saved PDF load error:",
            error
          );

          setScreen("home");
        } finally {
          setIsInitializing(
            false
          );
        }
      };

    loadRememberedPdf();
  }, []);

  // =========================
  // 학습 날짜 불러오기
  // =========================

  useEffect(() => {
    const loadStudyDates =
      async () => {
        try {
          const dates =
            await getStudyDatesFromDatabase(
              language
            );

          setStudyDates(
            dates
          );
        } catch (error) {
          console.error(
            "Study dates load error:",
            error
          );
        }
      };

    loadStudyDates();
    }, [
    screen,
    rememberedPdfs,
    language,
  ]);

  // =========================
  // 홈 날짜 단어 불러오기
  // =========================

  useEffect(() => {
    if (
      screen !== "home"
    ) {
      return;
    }

    const loadHomeWords =
      async () => {
        try {
          if (
            homeDateMode ===
            "date"
          ) {
            const words =
              await getWordsForDateFromDatabase(
                language,
                homeSelectedDate
              );

            setHomeWords(
              words
            );
          }

          if (
            homeDateMode ===
            "month"
          ) {
            const words =
              await getWordsForMonthFromDatabase(
                language,
                calendarMonth.getFullYear(),
                calendarMonth.getMonth()
              );

            setHomeMonthWords(
              words
            );
          }
        } catch (error) {
          console.error(
            "Home words load error:",
            error
          );
        }
      };

    loadHomeWords();
  }, [
    screen,
    language,
    homeSelectedDate,
    homeDateMode,
    calendarMonth,
    studyDates,
  ]);

  // =========================
  // 단어장 불러오기
  // =========================

  useEffect(() => {
    if (
      screen !== "home"
    ) {
      return;
    }

    const loadWordbook =
      async () => {
        try {
          const words =
            await getWordbookFromDatabase(
              language,
              wordbookSort
            );

          setWordbookWords(
            words
          );
        } catch (error) {
          console.error(
            "Wordbook load error:",
            error
          );
        }
      };

    loadWordbook();
  }, [
    screen,
    language,
    wordbookSort,
  ]);

  // =========================
// 첫 페이지 표지 만들기
// =========================

const createCoverImage =
  async (
    loadedPdf,
    pdfId
  ) => {
    try {
      const firstPage =
        await loadedPdf.getPage(
          1
        );

      const viewport =
        firstPage.getViewport({
          scale: 0.35,
        });

      const coverCanvas =
        document.createElement(
          "canvas"
        );

      const context =
        coverCanvas.getContext(
          "2d"
        );

      coverCanvas.width =
        viewport.width;

      coverCanvas.height =
        viewport.height;

      await firstPage.render({
        canvasContext:
          context,

        viewport,
      }).promise;

      const image =
        coverCanvas.toDataURL(
          "image/png"
        );

      setCoverImages(
        (previous) => ({
          ...previous,
          [pdfId]: image,
        })
      );

      // =========================
      // 표지를 IndexedDB에도 저장
      // =========================

      const database =
        await openDatabase();

      const transaction =
        database.transaction(
          STORE_NAME,
          "readwrite"
        );

      const store =
        transaction.objectStore(
          STORE_NAME
        );

      const request =
        store.get(pdfId);

      request.onsuccess =
        () => {
          const pdfData =
            request.result;

          if (!pdfData) {
            return;
          }

          pdfData.coverImage =
            image;

          store.put(
            pdfData
          );
        };

      transaction.oncomplete =
        () => {
          database.close();
        };

      transaction.onerror =
        () => {
          database.close();

          console.error(
            "Cover image save error:",
            transaction.error
          );
        };
    } catch (error) {
      console.error(
        "Cover image error:",
        error
      );
    }
  };

  // =========================
  // 저장된 PDF 열기
  // =========================

  const openSavedPdf =
    async (
      savedPdf,
      dateToSelect =
        getLocalDateString()
    ) => {
      try {
        const savedPdfs =
          await getPdfsFromDatabase();

        const latestPdf =
          savedPdfs.find(
            (item) =>
              item.id ===
              savedPdf.id
          );

        if (!latestPdf) {
          alert(
            "PDF를 찾을 수 없습니다."
          );

          return;
        }

        const pdfLanguage =
          latestPdf.language ||
          "da-DK";

        if (
          !latestPdf.language
        ) {
          await updatePdfLanguage(
            latestPdf.id,
            pdfLanguage
          );
        }

        setRememberedPdf({
          name:
            latestPdf.name,

          id:
            latestPdf.id,
        });

        setLanguage(
          pdfLanguage
        );

        setPdfFile(
          latestPdf.file
        );

        const arrayBuffer =
          await latestPdf.file.arrayBuffer();

        const loadingTask =
          pdfjsLib.getDocument({
            data: arrayBuffer,
          });

        const loadedPdf =
          await loadingTask.promise;

        const savedPage =
          Math.min(
            latestPdf.lastPage ||
              1,
            loadedPdf.numPages
          );

        setPageNumber(
          savedPage
        );

        setPageInput(
          String(savedPage)
        );

        setScale(1.5);

        setSelectedText("");
        setPopupPosition(null);

        setSelectedDate(
  dateToSelect
);

const wordsForSelectedDate =
  await getTodayWordsFromDatabase(
    latestPdf.id,
    pdfLanguage,
    dateToSelect
  );

setTodayWords(
  wordsForSelectedDate
);

        setPdf(
          loadedPdf
        );

        await createCoverImage(
          loadedPdf,
          latestPdf.id
        );

        setScreen("reader");
      } catch (error) {
        console.error(
          "Saved PDF open error:",
          error
        );

        alert(
          "PDF를 열지 못했습니다."
        );
      }
    };

  // =========================
  // PDF 삭제
  // =========================

  const deletePdf =
    async (
      pdfId
    ) => {
      const savedPdf =
        rememberedPdfs.find(
          (pdf) =>
            pdf.id === pdfId
        );

      if (!savedPdf) {
        return;
      }

      const confirmed =
        window.confirm(
          `"${savedPdf.name}" PDF를 정말 삭제하시겠어요?\n\n이 PDF에 저장된 학습 기록과 OCR 데이터도 함께 삭제됩니다.`
        );

      if (!confirmed) {
        return;
      }

      try {
        await deletePdfFromDatabase(
          pdfId
        );

        setRememberedPdfs(
          (previous) =>
            previous.filter(
              (pdf) =>
                pdf.id !== pdfId
            )
        );

        setCoverImages(
          (previous) => {
            const next = {
              ...previous,
            };

            delete next[pdfId];

            return next;
          }
        );

        const dates =
  await getStudyDatesFromDatabase(
    language
  );

        setStudyDates(
          dates
        );

        if (
          rememberedPdf?.id ===
          pdfId
        ) {
          setRememberedPdf(
            null
          );

          setPdf(null);

          setPdfFile(null);

          setSelectedDate(
            getLocalDateString()
          );

          setScreen("home");
        }
      } catch (error) {
        console.error(
          "PDF delete error:",
          error
        );

        alert(
          "PDF를 삭제하지 못했습니다."
        );
      }
    };

  // =========================
  // PDF 언어 변경
  // =========================

  const changePdfLanguage =
    async (
      pdfId,
      newLanguage
    ) => {
      try {
        await updatePdfLanguage(
          pdfId,
          newLanguage
        );

        setRememberedPdfs(
          (previous) =>
            previous.map(
              (pdf) =>
                pdf.id === pdfId
                  ? {
                      ...pdf,
                      language:
                        newLanguage,
                    }
                  : pdf
            )
        );

        if (
          rememberedPdf?.id ===
          pdfId
        ) {
          setLanguage(
            newLanguage
          );
        }
      } catch (error) {
        console.error(
          "PDF language change error:",
          error
        );

        alert(
          "PDF 언어를 변경하지 못했습니다."
        );
      }
    };

  // =========================
  // OCR 언어
  // =========================

  const getOcrLanguage =
    (
      currentLanguage
    ) => {
      if (
        currentLanguage ===
        "en-US"
      ) {
        return "eng";
      }

      if (
        currentLanguage ===
        "ko-KR"
      ) {
        return "kor";
      }

      if (
        currentLanguage ===
        "ja-JP"
      ) {
        return "jpn";
      }

      if (
        currentLanguage ===
        "fr-FR"
      ) {
        return "fra";
      }

      return "dan";
    };

  // =========================
  // 마지막 페이지 저장
  // =========================

  useEffect(() => {
    setPageInput(
      String(pageNumber)
    );

    if (
      rememberedPdf?.id &&
      screen === "reader"
    ) {
      saveLastPageToDatabase(
        rememberedPdf.id,
        pageNumber
      ).catch(
        (error) => {
          console.error(
            "Last page save error:",
            error
          );
        }
      );
    }
  }, [
    pageNumber,
    rememberedPdf,
    screen,
  ]);

  // =========================
  // 선택한 날짜의 단어 불러오기
  // =========================

  useEffect(() => {
    if (!rememberedPdf?.id) {
      setTodayWords([]);

      return;
    }

    const loadTodayWords =
      async () => {
        try {
          const words =
            await getTodayWordsFromDatabase(
              rememberedPdf.id,
              language,
              selectedDate
            );

          setTodayWords(
            words
          );
        } catch (error) {
          console.error(
            "Today's words load error:",
            error
          );
        }
      };

    loadTodayWords();
  }, [
    rememberedPdf,
    language,
    selectedDate,
  ]);

 // =========================
// 뜻 상자 바깥 클릭 시 닫기
// =========================

useEffect(() => {
  const handleMouseDown =
    (event) => {
      const menu =
        event.target.closest(
          ".today-word-context-menu"
        );

      if (!menu) {
        setTodayWordMenu(null);
      }
    };

  document.addEventListener(
    "mousedown",
    handleMouseDown
  );

  return () => {
    document.removeEventListener(
      "mousedown",
      handleMouseDown
    );
  };
}, []);

  // =========================
  // 번역
  // =========================

  useEffect(() => {
    if (
      !translationText.trim()
    ) {
      return;
    }

    const translateText =
      async () => {
        try {
          setTranslationResult(
            null
          );

          const response =
            await fetch(
              "/api/translate",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    text:
                      translationText.trim(),

                    language,
                  }),
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            setTranslationResult({
              error:
                data.error ||
                "번역을 불러오지 못했습니다.",
            });

            return;
          }

          setTranslationResult(
            data
          );
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
  }, [
    translationText,
    language,
  ]);

  // =========================
  // PDF 글자 선택
  // =========================

  useEffect(() => {
    const handleSelectionChange =
      () => {
        const selection =
          window.getSelection();

        if (
          !selection ||
          selection.isCollapsed
        ) {
          setSelectedText("");
          setPopupPosition(null);

          return;
        }

        const text =
          selection.toString();

        if (!text.trim()) {
          setSelectedText("");
          setPopupPosition(null);

          return;
        }

        const selectedNode =
          selection.anchorNode;

        if (!selectedNode) {
          return;
        }

        const selectedElement =
          selectedNode.nodeType ===
          Node.TEXT_NODE
            ? selectedNode.parentElement
            : selectedNode;

        if (
          !selectedElement?.closest(
            ".text-layer"
          )
        ) {
          return;
        }

        const selectionRange =
          selection.getRangeAt(0);

        const rect =
          selectionRange.getBoundingClientRect();

        setSelectedText(
          text
        );

        setTranslationOpen(
          true
        );

        setPopupPosition({
          left:
            rect.left +
            rect.width / 2,

          top:
            rect.top - 10,
        });
      };

    const handleMouseUp =
      () => {
        const selection =
          window.getSelection();

        if (
          !selection ||
          selection.isCollapsed
        ) {
          return;
        }

        const text =
          selection
            .toString()
            .trim();

        if (!text) {
          return;
        }

        const selectedNode =
          selection.anchorNode;

        if (!selectedNode) {
          return;
        }

        const selectedElement =
          selectedNode.nodeType ===
          Node.TEXT_NODE
            ? selectedNode.parentElement
            : selectedNode;

        if (
          !selectedElement?.closest(
            ".text-layer"
          )
        ) {
          return;
        }

        setTranslationText(
          text
        );
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
    setScale(
      (current) =>
        Math.min(
          current + 0.375,
          3
        )
    );
  };

  const zoomOut = () => {
    setScale(
      (current) =>
        Math.max(
          current - 0.375,
          0.75
        )
    );
  };

  // =========================
  // 페이지 이동
  // =========================

  const goToPage =
    (value) => {
      if (!pdf) {
        return;
      }

      const number =
        Number(value);

      if (
        !Number.isFinite(number)
      ) {
        setPageInput(
          String(pageNumber)
        );

        return;
      }

      const nextPage =
        Math.min(
          pdf.numPages,
          Math.max(
            1,
            Math.floor(number)
          )
        );

      setPageNumber(
        nextPage
      );

      setPageInput(
        String(nextPage)
      );

      setSelectedText("");
      setPopupPosition(null);
    };

  // =========================
  // OCR
  // =========================

  const runOcr =
    async (
      canvas,
      currentPageNumber
    ) => {
      setOcrLoading(
        true
      );

      try {
        const ocrLanguage =
          getOcrLanguage(
            language
          );

        const currentPdfId =
          rememberedPdf?.id;

        if (!currentPdfId) {
          return;
        }

        const cacheKey =
          `${currentPdfId}-${currentPageNumber}-${ocrLanguage}`;

        const renderWords =
          (
            words,
            sourceScale
          ) => {
            const textLayer =
              textLayerRef.current;

            if (!textLayer) {
              return;
            }

            textLayer.innerHTML =
              "";

            const scaleRatio =
              scale /
              sourceScale;

            words.forEach(
              (word) => {
                const span =
                  document.createElement(
                    "span"
                  );

                span.textContent =
                  word.text + " ";

                span.style.position =
                  "absolute";

                span.style.left =
                  `${
                    word.x *
                    scaleRatio
                  }px`;

                span.style.top =
                  `${
                    word.y *
                    scaleRatio
                  }px`;

                span.style.width =
                  `${Math.max(
                    word.width *
                      scaleRatio,
                    10
                  )}px`;

                span.style.height =
                  `${Math.max(
                    word.height *
                      scaleRatio,
                    10
                  )}px`;

                span.style.fontSize =
                  `${Math.max(
                    word.height *
                      scaleRatio,
                    10
                  )}px`;

                span.style.fontFamily =
                  "sans-serif";

                span.style.color =
                  "transparent";

                span.style.whiteSpace =
                  "pre";

                span.style.cursor =
                  "text";

                textLayer.appendChild(
                  span
                );
              }
            );
          };

        // =========================
        // 메모리 캐시 확인
        // =========================

        if (
          ocrCacheRef.current.has(
            cacheKey
          )
        ) {
          const cached =
            ocrCacheRef.current.get(
              cacheKey
            );

          renderWords(
            cached.words,
            cached.scale
          );

          return;
        }

        // =========================
        // IndexedDB OCR 확인
        // =========================

        const savedPdfs =
          await getPdfsFromDatabase();

        const currentPdf =
          savedPdfs.find(
            (item) =>
              item.id ===
              currentPdfId
          );

        const savedOcr =
          currentPdf?.ocrData?.[
            ocrLanguage
          ]?.[currentPageNumber];

        if (savedOcr) {
          ocrCacheRef.current.set(
            cacheKey,
            savedOcr
          );

          renderWords(
            savedOcr.words,
            savedOcr.scale
          );

          return;
        }

        // =========================
        // 실제 OCR 실행
        // =========================

        if (
          !ocrWorkerRef.current ||
          ocrLanguageRef.current !==
            ocrLanguage
        ) {
          if (
            ocrWorkerRef.current
          ) {
            await ocrWorkerRef.current.terminate();
          }

          ocrWorkerRef.current =
            await createWorker(
              ocrLanguage
            );

          ocrLanguageRef.current =
            ocrLanguage;
        }

        const worker =
          ocrWorkerRef.current;

        const result =
          await worker.recognize(
            canvas,
            {},
            {
              blocks: true,
              text: true,
            }
          );

        const cachedWords =
          [];

        const blocks =
          result?.data?.blocks;

        if (
          blocks &&
          blocks.length > 0
        ) {
          blocks.forEach(
            (block) => {
              block.paragraphs?.forEach(
                (paragraph) => {
                  paragraph.lines?.forEach(
                    (line) => {
                      line.words?.forEach(
                        (word) => {
                          if (
                            !word.text?.trim()
                          ) {
                            return;
                          }

                          const x =
                            word.bbox?.x0 ??
                            0;

                          const y =
                            word.bbox?.y0 ??
                            0;

                          const x1 =
                            word.bbox?.x1 ??
                            x + 10;

                          const y1 =
                            word.bbox?.y1 ??
                            y + 10;

                          cachedWords.push({
                            text:
                              word.text,

                            x,
                            y,

                            width:
                              x1 - x,

                            height:
                              y1 - y,
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }

        const newOcrData = {
          words:
            cachedWords,

          scale,
        };

        ocrCacheRef.current.set(
          cacheKey,
          newOcrData
        );

        if (
          rememberedPdf?.id
        ) {
          await saveOcrDataToDatabase(
            rememberedPdf.id,
            currentPageNumber,
            ocrLanguage,
            cachedWords,
            scale
          );
        }

        renderWords(
          cachedWords,
          scale
        );
      } catch (error) {
        console.error(
          "OCR error:",
          error
        );

        alert(
          "OCR 중 오류가 발생했습니다."
        );
      } finally {
        setOcrLoading(
          false
        );
      }
    };

  // =========================
  // PDF 페이지 렌더링
  // =========================

  useEffect(() => {
    if (
      !pdf ||
      screen !== "reader"
    ) {
      return;
    }

    let cancelled = false;

    const renderPage =
      async () => {
        try {
          const page =
            await pdf.getPage(
              pageNumber
            );

          if (cancelled) {
            return;
          }

          const viewport =
            page.getViewport({
              scale,
            });

          const canvas =
            canvasRef.current;

          const textLayer =
            textLayerRef.current;

          if (
            !canvas ||
            !textLayer
          ) {
            return;
          }

          const context =
  canvas.getContext(
    "2d"
  );

if (renderTaskRef.current) {
  renderTaskRef.current.cancel();
  renderTaskRef.current = null;
}

canvas.width =
  viewport.width;

canvas.height =
  viewport.height;

canvas.style.width =
  `${viewport.width}px`;

canvas.style.height =
  `${viewport.height}px`;

textLayer.innerHTML =
  "";

textLayer.style.width =
  `${viewport.width}px`;

textLayer.style.height =
  `${viewport.height}px`;

renderTaskRef.current =
  page.render({
    canvasContext:
      context,

    viewport,
  });

try {
  await renderTaskRef.current.promise;
} catch (error) {
  if (
    error?.name !==
    "RenderingCancelledException"
  ) {
    throw error;
  }

  return;
} finally {
  renderTaskRef.current = null;
}

if (cancelled) {
  return;
}

const textContent =
  await page.getTextContent();

const realText =
  textContent.items
    .map(
      (item) =>
        item.str
    )
    .join("")
    .trim();

if (
  realText.length > 2
) {
  textContent.items.forEach(
    (item) => {
      if (!item.str) {
        return;
      }

      const span =
        document.createElement(
          "span"
        );

      span.textContent =
        item.str;

      const tx =
        pdfjsLib.Util.transform(
          viewport.transform,
          item.transform
        );

      const fontHeight =
        Math.hypot(
          tx[2],
          tx[3]
        );

      span.style.position =
        "absolute";

      span.style.left =
        `${tx[4]}px`;

      span.style.top =
        `${
          tx[5] -
          fontHeight
        }px`;

      span.style.fontSize =
        `${fontHeight}px`;

      span.style.fontFamily =
        "sans-serif";

      span.style.color =
        "transparent";

      span.style.whiteSpace =
        "pre";

      span.style.cursor =
        "text";

      const itemWidth =
        Math.abs(
          tx[0]
        ) ||
        item.width *
          scale;

      span.style.width =
        `${itemWidth}px`;

      span.style.height =
        `${fontHeight}px`;

      textLayer.appendChild(
        span
      );
    }
  );
} else {
  await runOcr(
    canvas,
    pageNumber
  );
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
  }, [
    pdf,
    pageNumber,
    scale,
    language,
    screen,
  ]);

  // =========================
  // PDF 파일 등록
  // =========================

  const handleFileChange =
    async (
      event
    ) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      try {
        const savedPdf =
          await savePdfToDatabase(
            file,
            language
          );

        setRememberedPdfs(
          (previous) => [
            ...previous,
            savedPdf,
          ]
        );

        setPdfFile(
          file
        );

        setRememberedPdf({
          name:
            savedPdf.name,

          id:
            savedPdf.id,
        });

        const arrayBuffer =
          await file.arrayBuffer();

        const loadingTask =
          pdfjsLib.getDocument({
            data: arrayBuffer,
          });

        const loadedPdf =
          await loadingTask.promise;

        setPdf(
          loadedPdf
        );

        await createCoverImage(
          loadedPdf,
          savedPdf.id
        );

        setPageNumber(1);

        setPageInput("1");

        setScale(1.5);

        setSelectedText("");

setPopupPosition(null);

setSelectedDate(
  getLocalDateString()
);

setScreen("reader");
      } catch (error) {
        console.error(
          "PDF error:",
          error
        );

        alert(
          "PDF를 불러오지 못했습니다."
        );
      }

      event.target.value =
        "";
    };

  // =========================
  // TTS
  // =========================

  const speakText =
    async () => {
      if (!selectedText) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/tts",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  text:
                    selectedText,

                  language,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          console.error(data);

          alert(
            "TTS 오류가 발생했습니다."
          );

          return;
        }

        const audio =
          new Audio(
            "data:audio/mp3;base64," +
              data.audioContent
          );

        await audio.play();

        if (
          rememberedPdf?.id &&
          selectedText.trim()
        ) {
          const translations =
            translationResult?.translations ||
            [];

          let meaning = "";

          if (
            language ===
            "ko-KR"
          ) {
            const danishTranslation =
              translations.find(
                (translation) =>
                  translation.languageName ===
                  "Dansk"
              );

            meaning =
              danishTranslation?.text?.trim() ||
              "";
          } else {
            const koreanTranslation =
              translations.find(
                (translation) =>
                  translation.languageName ===
                  "한국어"
              );

            meaning =
              koreanTranslation?.text?.trim() ||
              "";
          }

          const today =
            getLocalDateString();

          setSelectedDate(
            today
          );

          await saveWordToDatabase({
            word:
              selectedText.trim(),

            language,

            pdfId:
              rememberedPdf.id,

            originalForm:
              selectedText.trim(),

            displayForm:
              selectedText.trim(),

            meaning,
          });

          const words =
            await getTodayWordsFromDatabase(
              rememberedPdf.id,
              language,
              today
            );

          setTodayWords(
            words
          );

          const dates =
  await getStudyDatesFromDatabase(
    language
  );

          setStudyDates(
            dates
          );
        }
      } catch (error) {
        console.error(
          error
        );

        alert(
          "TTS 서버에 연결할 수 없습니다."
        );
      }
    };

  const speakTranslationText =
    async () => {
      if (
        !translationText.trim()
      ) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/tts",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  text:
                    translationText.trim(),

                  language,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          console.error(data);

          alert(
            "TTS 오류가 발생했습니다."
          );

          return;
        }

        const audio =
          new Audio(
            "data:audio/mp3;base64," +
              data.audioContent
          );

        await audio.play();

        if (
          rememberedPdf?.id &&
          translationText.trim()
        ) {
          await recordWordPlayToDatabase(
            translationText.trim(),
            language,
            rememberedPdf.id,
            selectedDate
          );

          const words =
            await getTodayWordsFromDatabase(
              rememberedPdf.id,
              language,
              selectedDate
            );

          setTodayWords(
            words
          );

          const dates =
  await getStudyDatesFromDatabase(
    language
  );

          setStudyDates(
            dates
          );
        }
      } catch (error) {
        console.error(
          error
        );

        alert(
          "TTS 서버에 연결할 수 없습니다."
        );
      }
    };

  const speakInputText =
    async () => {
      if (
        !ttsText.trim()
      ) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/tts",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  text:
                    ttsText.trim(),

                  language,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          console.error(data);

          alert(
            "TTS 오류가 발생했습니다."
          );

          return;
        }

        const audio =
          new Audio(
            "data:audio/mp3;base64," +
              data.audioContent
          );

        await audio.play();
      } catch (error) {
        console.error(
          error
        );

        alert(
          "TTS 서버에 연결할 수 없습니다."
        );
      }
    };

  // =========================
  // 단어장 TTS
  // =========================

  const speakWordbookWord =
    async (
      word
    ) => {
      try {
        const response =
          await fetch(
            "/api/tts",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  text:
                    word.word,

                  language:
                    word.language,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          console.error(data);

          alert(
            "TTS 오류가 발생했습니다."
          );

          return;
        }

        const audio =
          new Audio(
            "data:audio/mp3;base64," +
              data.audioContent
          );

        await audio.play();

        await recordWordbookPlayToDatabase(
          word.id
        );

        const words =
          await getWordbookFromDatabase(
            language,
            wordbookSort
          );

        setWordbookWords(
          words
        );
      } catch (error) {
        console.error(
          error
        );

        alert(
          "TTS 서버에 연결할 수 없습니다."
        );
      }
    };

  // =========================
  // 언어 변경
  // =========================

  const changeLanguage =
    async (
      newLanguage
    ) => {
      setLanguage(
        newLanguage
      );

      setHomeDateMode(
        "date"
      );

      setHomeSelectedDate(
        getLocalDateString()
      );

      if (
        ocrWorkerRef.current
      ) {
        await ocrWorkerRef.current.terminate();

        ocrWorkerRef.current =
          null;

        ocrLanguageRef.current =
          null;
      }
    };

  // =========================
  // 달력
  // =========================

  const today =
    getLocalDateString();

  const calendarYear =
    calendarMonth.getFullYear();

  const calendarMonthIndex =
    calendarMonth.getMonth();

  const firstDay =
    new Date(
      calendarYear,
      calendarMonthIndex,
      1
    ).getDay();

  const daysInMonth =
    new Date(
      calendarYear,
      calendarMonthIndex + 1,
      0
    ).getDate();

  const calendarCells =
    [];

  for (
    let index = 0;
    index < firstDay;
    index += 1
  ) {
    calendarCells.push(
      null
    );
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day += 1
  ) {
    calendarCells.push(
      day
    );
  }

  const formatCalendarDate =
    (day) => {
      return (
        `${calendarYear}-${String(
          calendarMonthIndex + 1
        ).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}`
      );
    };

  const moveCalendarMonth =
    (amount) => {
      const nextMonth =
        new Date(
          calendarYear,
          calendarMonthIndex +
            amount,
          1
        );

      const currentMonth =
        new Date();

      const currentMonthStart =
        new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth(),
          1
        );

      if (
        nextMonth >
        currentMonthStart
      ) {
        return;
      }

      setCalendarMonth(
        nextMonth
      );

      setHomeDateMode(
        "month"
      );
    };

  const handleCalendarDateClick =
    (date) => {
      if (
        date > today
      ) {
        return;
      }

      setHomeSelectedDate(
        date
      );

      setHomeDateMode(
        "date"
      );
    };

  const handleMonthTitleClick =
    () => {
      setHomeDateMode(
        "month"
      );
    };

  const isCurrentMonth =
    calendarYear ===
      new Date().getFullYear() &&
    calendarMonthIndex ===
      new Date().getMonth();

  // =========================
  // 홈 PDF 필터
  // =========================

  const homePdfs =
    rememberedPdfs.filter(
      (savedPdf) =>
        (
          savedPdf.language ||
          "da-DK"
        ) === language
    );

  // =========================
  // 초기 로딩 화면
  // =========================

  if (isInitializing) {
    return (
      <div className="app">
        <h1>
          PDF Reader
        </h1>
      </div>
    );
  }

  // =========================
  // 관리자 화면
  // =========================

  if (screen === "admin") {

    const loginAdmin = async () => {
      setAdminLoading(true);
      setAdminError("");

      try {
        const response = await fetch(
          "/api/admin-login",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              password: adminPassword,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setAdminError(
            data.error ||
              "로그인에 실패했습니다."
          );
          return;
        }

        const [ttsResponse, translateResponse] =
          await Promise.all([
            fetch("/api/admin-usage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password }),
}),
            fetch("/api/admin-usage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password }),
}),
          ]);

        const ttsData =
          await ttsResponse.json();
        const translateData =
          await translateResponse.json();

        setTtsUsage(ttsData);
        setTranslateUsage(
          translateData
        );
        setAdminLoggedIn(true);
      } catch (error) {
        console.error(error);
        setAdminError(
          "서버에 연결할 수 없습니다."
        );
      } finally {
        setAdminLoading(false);
      }
    };

    if (!adminLoggedIn) {
      return (
        <div className="app">
          <h1
            onClick={() => setScreen("home")}
            style={{
              cursor: "pointer",
            }}
          >
            PDF Reader
          </h1>

          <div
            style={{
              maxWidth: "420px",
              width: "100%",
              margin: "80px auto",
              padding: "30px",
              boxSizing: "border-box",
              textAlign: "center",
            }}
          >
            <h2>관리자 페이지</h2>

            <p
              style={{
                marginTop: "12px",
                marginBottom: "28px",
              }}
            >
              관리자 비밀번호를 입력해주세요.
            </p>

            <input
              type="password"
              value={adminPassword}
              onChange={(e) =>
                setAdminPassword(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loginAdmin();
                }
              }}
              placeholder="비밀번호"
              style={{
                width: "100%",
                padding: "14px",
                boxSizing: "border-box",
                borderRadius: "10px",
                border: "1px solid #ccc",
                fontSize: "16px",
              }}
            />

            <button
              onClick={loginAdmin}
              disabled={adminLoading}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "14px",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              {adminLoading
                ? "확인 중..."
                : "로그인"}
            </button>

            {adminError && (
              <p
                style={{
                  marginTop: "16px",
                  color: "crimson",
                }}
              >
                {adminError}
              </p>
            )}
          </div>
        </div>
      );
    }

    const ttsCharacters =
      Number(ttsUsage?.characters || 0);

    const translateCharacters =
      Number(
        translateUsage?.characters || 0
      );

    const ttsLimit = 1000000;
    const translateLimit = 500000;

    const ttsPercent = Math.min(
      (ttsCharacters / ttsLimit) * 100,
      100
    );

    const translatePercent =
      Math.min(
        (translateCharacters /
          translateLimit) *
          100,
        100
      );

    return (
      <div className="app">
        <h1
          onClick={() => setScreen("home")}
          style={{
            cursor: "pointer",
          }}
        >
          PDF Reader
        </h1>

        <div
          style={{
            maxWidth: "600px",
            width: "100%",
            margin: "40px auto",
            padding: "30px",
            boxSizing: "border-box",
          }}
        >
          <h2>관리자 페이지</h2>

          <div
            style={{
              marginTop: "30px",
              padding: "24px",
              borderRadius: "16px",
              background: "#f5f5f5",
            }}
          >
            <h3>🔊 TTS</h3>

            <p
              style={{
                fontSize: "28px",
                fontWeight: "bold",
                margin: "16px 0 8px",
              }}
            >
              {ttsCharacters.toLocaleString()}자
            </p>

            <p>
              이번 달 사용량 / 1,000,000자
            </p>

            <div
              style={{
                height: "12px",
                background: "#ddd",
                borderRadius: "10px",
                overflow: "hidden",
                marginTop: "16px",
              }}
            >
              <div
                style={{
                  width: `${ttsPercent}%`,
                  height: "100%",
                  background: "#555",
                }}
              />
            </div>

            <p
              style={{
                textAlign: "right",
                marginTop: "8px",
              }}
            >
              {ttsPercent.toFixed(1)}%
            </p>
          </div>

          <div
            style={{
              marginTop: "20px",
              padding: "24px",
              borderRadius: "16px",
              background: "#f5f5f5",
            }}
          >
            <h3>🌐 번역</h3>

            <p
              style={{
                fontSize: "28px",
                fontWeight: "bold",
                margin: "16px 0 8px",
              }}
            >
              {translateCharacters.toLocaleString()}자
            </p>

            <p>
              이번 달 사용량 / 500,000자
            </p>

            <div
              style={{
                height: "12px",
                background: "#ddd",
                borderRadius: "10px",
                overflow: "hidden",
                marginTop: "16px",
              }}
            >
              <div
                style={{
                  width: `${translatePercent}%`,
                  height: "100%",
                  background: "#555",
                }}
              />
            </div>

            <p
              style={{
                textAlign: "right",
                marginTop: "8px",
              }}
            >
              {translatePercent.toFixed(1)}%
            </p>
          </div>

          <button
            onClick={() => setScreen("home")}
            style={{
              marginTop: "30px",
              padding: "12px 20px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            홈으로
          </button>
        </div>
      </div>
    );
  }
  // =========================
  // 홈 화면
  // =========================

  if (
    screen === "home"
  ) {
    const monthName =
      `${calendarYear}년 ${
        calendarMonthIndex + 1
      }월`;

    return (
      <div className="app">
        <h1
          onClick={() => {
            setScreen("home");
          }}
          style={{
            cursor: "pointer",
          }}
        >
          PDF Reader
        </h1>

        {/* =========================
            공부 언어
            ========================= */}

        <div
  className="language-buttons"
  style={{
    marginBottom: "28px",
    width: "100%",
    justifyContent: "center",
  }}
>
          {LANGUAGE_OPTIONS.map(
            (option) => (
              <button
                key={
                  option.value
                }
                className={
                  language ===
                  option.value
                    ? "active"
                    : ""
                }
                onClick={() =>
                  changeLanguage(
                    option.value
                  )
                }
              >
                {
                  option.label
                }
              </button>
            )
          )}
        </div>

        {/* =========================
            홈 3열
            ========================= */}

        <div
          style={{
  display:"grid",
  gridTemplateColumns:
    "minmax(0, 1.3fr) minmax(280px, 1fr) minmax(280px, 1fr)",
  gap:"28px",
  alignItems:"start",
  width:"100%",
  margin:"0 auto",
}}
        >
          {/* =========================
              왼쪽 - PDF Library
              ========================= */}

          <section
            style={{
              minWidth: 0,
            }}
          >
            <h2>
              My Library
            </h2>

            <p
              style={{
                fontSize:
                  "13px",
                opacity:
                  0.55,
                marginTop:
                  "-8px",
                marginBottom:
                  "18px",
              }}
            >
              {
                getLanguageLabel(
                  language
                )
              }
            </p>

            <div
              className="book-list"
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(3, minmax(0, 1fr))",
                gap: "18px",
              }}
            >
              {homePdfs.map(
                (
                  savedPdf
                ) => (
                  <div
                    key={
                      savedPdf.id
                    }
                    className="book-card"
                  >
                    <button
                      className="book-open-button"
                      onClick={() =>
                        openSavedPdf(
                          savedPdf
                        )
                      }
                    >
                      {coverImages[
                        savedPdf.id
                      ] ? (
                        <img
                          src={
                            coverImages[
                              savedPdf.id
                            ]
                          }
                          alt={
                            savedPdf.name
                          }
                          className="book-cover"
                        />
                      ) : (
                        <div className="book-cover-placeholder">
                          PDF
                        </div>
                      )}

                      <div className="book-title">
                        {
                          savedPdf.name
                        }
                      </div>
                    </button>

                    <div className="book-menu">
                      <button
                        className="book-menu-button"
                        onClick={(
                          event
                        ) => {
                          event.stopPropagation();

                          setOpenBookMenuId(
                            openBookMenuId ===
                              savedPdf.id
                              ? null
                              : savedPdf.id
                          );
                        }}
                      >
                        ⋮
                      </button>

                      {openBookMenuId ===
                        savedPdf.id && (
                        <div className="book-menu-dropdown">
                          <div
                            style={{
                              padding:
                                "6px 10px",
                              fontSize:
                                "11px",
                              opacity:
                                0.5,
                            }}
                          >
                            언어 변경
                          </div>

                          {LANGUAGE_OPTIONS.map(
                            (
                              option
                            ) => (
                              <button
                                key={
                                  option.value
                                }
                                onClick={async (
                                  event
                                ) => {
                                  event.stopPropagation();

                                  await changePdfLanguage(
                                    savedPdf.id,
                                    option.value
                                  );

                                  setOpenBookMenuId(
                                    null
                                  );
                                }}
                              >
                                {savedPdf.language ===
                                option.value
                                  ? "✓ "
                                  : ""}
                                {
                                  option.label
                                }
                              </button>
                            )
                          )}

                          <button
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              setOpenBookMenuId(
                                null
                              );

                              deletePdf(
                                savedPdf.id
                              );
                            }}
                          >
                            PDF 삭제
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              <div className="add-book">
                <label
                  htmlFor="pdf-upload"
                  className="add-book-button"
                >
                  + PDF 추가
                </label>

                <input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf"
                  onChange={
                    handleFileChange
                  }
                  style={{
                    display:
                      "none",
                  }}
                />
              </div>
            </div>
          </section>

          {/* =========================
              가운데 - 공부 달력
              ========================= */}

          <section
            style={{
              minWidth: 0,
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                marginBottom:
                  "16px",
              }}
            >
              <button
                onClick={() =>
                  moveCalendarMonth(
                    -1
                  )
                }
                style={{
                  border:
                    "none",
                  background:
                    "transparent",
                  fontSize:
                    "20px",
                  cursor:
                    "pointer",
                }}
              >
                ←
              </button>

              <button
                onClick={
                  handleMonthTitleClick
                }
                style={{
                  border:
                    "none",
                  background:
                    "transparent",
                  fontSize:
                    "18px",
                  fontWeight:
                    "700",
                  cursor:
                    "pointer",
                }}
                title="이 달의 전체 단어 보기"
              >
                {monthName}
              </button>

              <button
                onClick={() =>
                  moveCalendarMonth(
                    1
                  )
                }
                disabled={
                  isCurrentMonth
                }
                style={{
                  border:
                    "none",
                  background:
                    "transparent",
                  fontSize:
                    "20px",
                  cursor:
                    isCurrentMonth
                      ? "default"
                      : "pointer",
                  opacity:
                    isCurrentMonth
                      ? 0.3
                      : 1,
                }}
              >
                →
              </button>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(7, 1fr)",
                gap: "6px",
                marginBottom:
                  "6px",
              }}
            >
              {[
                "일",
                "월",
                "화",
                "수",
                "목",
                "금",
                "토",
              ].map(
                (day) => (
                  <div
                    key={day}
                    style={{
                      textAlign:
                        "center",
                      fontSize:
                        "12px",
                      opacity:
                        0.55,
                      padding:
                        "4px 0",
                    }}
                  >
                    {day}
                  </div>
                )
              )}
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(7, 1fr)",
                gap: "6px",
              }}
            >
              {calendarCells.map(
                (
                  day,
                  index
                ) => {
                  if (
                    day ===
                    null
                  ) {
                    return (
                      <div
                        key={
                          `empty-${index}`
                        }
                        style={{
                          aspectRatio:
                            "1",
                        }}
                      />
                    );
                  }

                  const date =
                    formatCalendarDate(
                      day
                    );

                  const studied =
                    studyDates.includes(
                      date
                    );

                  const isToday =
                    date ===
                    today;

                  const isSelected =
                    homeDateMode ===
                      "date" &&
                    homeSelectedDate ===
                      date;

                  const isFuture =
                    date >
                    today;

                  return (
                    <button
                      key={
                        date
                      }
                      disabled={
                        isFuture
                      }
                      onClick={() =>
                        handleCalendarDateClick(
                          date
                        )
                      }
                      style={{
                        position:
                          "relative",
                        aspectRatio:
                          "1",
                        border:
                          isSelected
                            ? "2px solid currentColor"
                            : isToday
                            ? "1px solid currentColor"
                            : "1px solid rgba(128,128,128,0.18)",
                        borderRadius:
                          "10px",
                        background:
                          "transparent",
                        cursor:
                          isFuture
                            ? "default"
                            : "pointer",
                        opacity:
                          isFuture
                            ? 0.25
                            : 1,
                        fontSize:
                          "14px",
                      }}
                    >
                      {day}

                      {studied && (
                        <span
                          style={{
                            position:
                              "absolute",
                            bottom:
                              "5px",
                            left:
                              "50%",
                            transform:
                              "translateX(-50%)",
                            width:
                              "5px",
                            height:
                              "5px",
                            borderRadius:
                              "50%",
                            background:
                              "currentColor",
                          }}
                        />
                      )}
                    </button>
                  );
                }
              )}
            </div>

            <p
              style={{
                textAlign:
                  "center",
                fontSize:
                  "12px",
                opacity:
                  0.55,
                marginTop:
                  "14px",
              }}
            >
              ● 공부한 날
            </p>

            {/* =========================
                날짜 / 월별 단어
                ========================= */}

            <div
              style={{
                marginTop:
                  "18px",
                borderTop:
                  "1px solid rgba(128,128,128,0.15)",
                paddingTop:
                  "18px",
              }}
            >
              {homeDateMode ===
              "date" ? (
                <>
                  <h3
                    style={{
                      marginTop:
                        0,
                    }}
                  >
                    📚{" "}
                    {
                      homeSelectedDate
                    }
                  </h3>

                  {homeWords.length ===
                  0 ? (
                    <p
                      style={{
                        fontSize:
                          "13px",
                        opacity:
                          0.55,
                      }}
                    >
                      이 날에는
                      저장된 단어가
                      없습니다.
                    </p>
                  ) : (
                    <div
                      style={{
                        maxHeight:
                          "360px",
                        overflowY:
                          "auto",
                        paddingRight:
                          "6px",
                      }}
                    >
                      {homeWords.map(
                        (
                          word
                        ) => (
                          <div
  key={
    word.id
  }
  className="home-word-item"
  onContextMenu={(event) => {
    event.preventDefault();
    event.stopPropagation();

    setWordbookContextMenu({
      x: event.clientX,
      y: event.clientY,
      wordId: word.id,
    });
  }}
>
  <span className="home-word-text">
    {
      word.word
    }
  </span>

  <button
    className="home-word-speak-button"
    onClick={async (
      event
    ) => {
      event.stopPropagation();

      try {
        const response =
          await fetch(
            "/api/tts",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  text:
                    word.word,

                  language:
                    word.language,
                }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          console.error(data);

          alert(
            "TTS 오류가 발생했습니다."
          );

          return;
        }

        const audio =
          new Audio(
            "data:audio/mp3;base64," +
              data.audioContent
          );

        await audio.play();

        await recordWordPlayToDatabase(
          word.word,
          word.language,
          word.pdfId,
          homeSelectedDate
        );

        const words =
          await getWordsForDateFromDatabase(
            language,
            homeSelectedDate
          );

        setHomeWords(
          words
        );

        const dates =
          await getStudyDatesFromDatabase(
            language
          );

        setStudyDates(
          dates
        );
      } catch (
        error
      ) {
        console.error(
          error
        );

        alert(
          "TTS 서버에 연결할 수 없습니다."
        );
      }
    }}
    title="발음 듣기"
  >
    🔊
  </button>

  <button
    className="home-word-star-button"
    onClick={async (
      event
    ) => {
      event.stopPropagation();

      try {
        await toggleWordStarInDatabase(
          word.id
        );

        const words =
          await getWordsForDateFromDatabase(
            language,
            homeSelectedDate
          );

        setHomeWords(
          words
        );

        const wordbook =
          await getWordbookFromDatabase(
            language,
            wordbookSort
          );

        setWordbookWords(
          wordbook
        );
      } catch (
        error
      ) {
        console.error(
          error
        );

        alert(
          "단어장 등록에 실패했습니다."
        );
      }
    }}
    title={
      word.isStarred
        ? "단어장에서 제거"
        : "단어장에 등록"
    }
  >
    {
      word.isStarred
        ? "★"
        : "☆"
    }
  </button>
</div>
                        )
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3
                    style={{
                      marginTop:
                        0,
                    }}
                  >
                    📚{" "}
                    {
                      monthName
                    }
                  </h3>

                  {homeMonthWords.length ===
                  0 ? (
                    <p
                      style={{
                        fontSize:
                          "13px",
                        opacity:
                          0.55,
                      }}
                    >
                      이 달에는
                      저장된 단어가
                      없습니다.
                    </p>
                  ) : (
                    <div
                      style={{
                        maxHeight:
                          "420px",
                        overflowY:
                          "auto",
                        paddingRight:
                          "6px",
                      }}
                    >
                      {(() => {
  const groupedWords = {};

  homeMonthWords.forEach(
    (word) => {
      if (!groupedWords[word.studyDate]) {
        groupedWords[word.studyDate] = [];
      }

      groupedWords[word.studyDate].push(
        word
      );
    }
  );

  return Object.entries(
    groupedWords
  ).map(
    ([
      date,
      words,
    ]) => (
      <div
        key={date}
        className="home-month-date-group"
      >
        <div className="home-month-date">
          {date}
        </div>

        <div className="home-month-word-list">
          {words.map(
            (word) => (
              <div
                key={word.id}
                className="home-month-word-item"
                onContextMenu={(
  event
) => {
  console.log(
    "오늘의 단어 우클릭됨",
    word
  );

  event.preventDefault();

  event.stopPropagation();

  setWordbookContextMenu({
    x: event.clientX,
    y: event.clientY,
    wordId: word.id,
  });
}}
              >
                <span className="home-month-word-text">
                  {word.word}
                </span>

                <button
                  className="home-month-word-speak-button"
                  onClick={async (
                    event
                  ) => {
                    event.stopPropagation();

                    try {
                      const response =
                        await fetch(
                          "/api/tts",
                          {
                            method:
                              "POST",

                            headers: {
                              "Content-Type":
                                "application/json",
                            },

                            body:
                              JSON.stringify({
                                text:
                                  word.word,

                                language:
                                  word.language,
                              }),
                          }
                        );

                      const data =
                        await response.json();

                      if (!response.ok) {
                        console.error(
                          data
                        );

                        alert(
                          "TTS 오류가 발생했습니다."
                        );

                        return;
                      }

                      const audio =
                        new Audio(
                          "data:audio/mp3;base64," +
                            data.audioContent
                        );

                      await audio.play();

                      await recordWordPlayToDatabase(
                        word.word,
                        word.language,
                        word.pdfId,
                        word.studyDate
                      );
                    } catch (
                      error
                    ) {
                      console.error(
                        error
                      );

                      alert(
                        "TTS 서버에 연결할 수 없습니다."
                      );
                    }
                  }}
                  title="발음 듣기"
                >
                  🔊
                </button>

                <button
                  className="home-month-word-star-button"
                  onClick={async (
                    event
                  ) => {
                    event.stopPropagation();

                    try {
                      await toggleWordStarInDatabase(
                        word.id
                      );

                      const words =
                        await getWordbookFromDatabase(
                          language,
                          wordbookSort
                        );

                      setWordbookWords(
                        words
                      );

                      const monthWords =
                        await getWordsForMonthFromDatabase(
                          language,
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth()
                        );

                      setHomeMonthWords(
                        monthWords
                      );
                    } catch (
                      error
                    ) {
                      console.error(
                        error
                      );

                      alert(
                        "단어장 등록에 실패했습니다."
                      );
                    }
                  }}
                  title={
                    word.isStarred
                      ? "단어장에서 제거"
                      : "단어장에 등록"
                  }
                >
                  {
                    word.isStarred ? "★" : "☆"
                  }
                </button>
              </div>
            )
          )}
        </div>
      </div>
    )
  );
})()}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* =========================
              오른쪽 - 단어장
              ========================= */}

          <section
            style={{
              minWidth: 0,
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap: "10px",
                marginBottom:
                  "16px",
              }}
            >
              <h2
                style={{
                  margin:
                    0,
                }}
              >
                ⭐ 단어장
              </h2>

              <select
                value={
                  wordbookSort
                }
                onChange={(
                  event
                ) =>
                  setWordbookSort(
                    event.target
                      .value
                  )
                }
                style={{
                  padding:
                    "6px 8px",
                  borderRadius:
                    "8px",
                  border:
                    "1px solid rgba(128,128,128,0.25)",
                  background:
                    "transparent",
                  fontSize:
                    "12px",
                }}
              >
                <option value="newest">
                  최근 등록한 순
                </option>

                <option value="oldest">
                  먼저 등록한 순
                </option>

                <option value="mostPlayed">
                  많이 들은 순
                </option>

                <option value="leastPlayed">
                  적게 들은 순
                </option>

                <option value="random">
                  랜덤 순
                </option>
              </select>
            </div>

            <div
              style={{
                maxHeight:
                  "650px",
                overflowY:
                  "auto",
                paddingRight:
                  "6px",
              }}
            >
              {wordbookWords.length ===
              0 ? (
                <p
                  style={{
                    fontSize:
                      "13px",
                    opacity:
                      0.55,
                  }}
                >
                  아직 등록된 단어가
                  없습니다.
                </p>
              ) : (
                wordbookWords.map(
  (
    word
  ) => (
    <div
      key={
        word.id
      }
      onContextMenu={(
        event
      ) => {
        event.preventDefault();

        setWordbookContextMenu({
          x: event.clientX,
          y: event.clientY,
          wordId: word.id,
        });
      }}
      style={{
        display:
          "flex",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        gap:
          "10px",
        padding:
          "10px 0",
        borderBottom:
          "1px solid rgba(128,128,128,0.1)",
      }}
    >
      <div
        style={{
          minWidth:
            0,
        }}
      >
        <div
          style={{
            fontSize:
              "15px",
            fontWeight:
              "600",
          }}
        >
          {
            word.word
          }
        </div>
      </div>

      <div
        style={{
          display:
            "flex",
          alignItems:
            "center",
          gap:
            "4px",
        }}
      >
        <button
          onClick={() =>
            speakWordbookWord(
              word
            )
          }
          title="단어장에서 듣기"
          style={{
            border:
              "none",
            background:
              "transparent",
            cursor:
              "pointer",
            fontSize:
              "16px",
          }}
        >
          🔊
        </button>

        <button
          onClick={async () => {
            try {
              await toggleWordStarInDatabase(
                word.id
              );

              const words =
                await getWordbookFromDatabase(
                  language,
                  wordbookSort
                );

              setWordbookWords(
                words
              );

              setWordbookContextMenu(
                null
              );
            } catch (
              error
            ) {
              console.error(
                error
              );

              alert(
                "단어장 변경에 실패했습니다."
              );
            }
          }}
          title="단어장에서 제거"
          style={{
            border:
              "none",
            background:
              "transparent",
            cursor:
              "pointer",
            fontSize:
              "18px",
          }}
        >
          ★
        </button>
      </div>
    </div>
  )
)
              )}
            </div>
                    </section>

          {wordbookContextMenu && (
            <div
              style={{
                position: "fixed",
                left:
                  wordbookContextMenu.x,
                top:
                  wordbookContextMenu.y,
                zIndex: 1000,
                minWidth:
                  "180px",
                maxWidth:
                  "280px",
                padding:
                  "10px 12px",
                border:
                  "1px solid rgba(128,128,128,0.25)",
                borderRadius:
                  "8px",
                background:
                  "white",
                boxShadow:
                  "0 4px 16px rgba(0,0,0,0.15)",
                fontSize:
                  "13px",
                lineHeight:
                  "1.5",
              }}
            >
              {
  [
    ...wordbookWords,
    ...homeWords,
    ...homeMonthWords,
  ].find(
    (word) =>
      word.id ===
      wordbookContextMenu.wordId
  )?.meaning ||
  "뜻이 등록되지 않았습니다."
}
            </div>
          )}

        </div>

        <div className="app-signature">
          <div className="app-version">
            v0.2.1
          </div>

          <div className="app-message">
            <button onClick={() => setScreen("admin")} style={{background:"none",border:"none",padding:0,cursor:"pointer",color:"inherit",font:"inherit"}}>테레사에게. 나랑 같이 공부해줘서 고마워요.</button>
          </div>
        </div>
      </div>
    );
  }
  // =========================
  // Reader 화면
  // =========================

  return (
    <div className="app">
      <div className="reader-header">
        <button
          className="home-button"
          style={{
            display: "none",
          }}
          onClick={() => {
            setSelectedText("");
            setPopupPosition(null);
            setScreen("home");
          }}
        >
          ⌂ 홈
        </button>

        <h1
          onClick={() => {
            setSelectedText("");
            setPopupPosition(null);
            setScreen("home");
          }}
          style={{
            cursor: "pointer",
          }}
        >
          PDF Reader
        </h1>
      </div>

      <div className="language-buttons">
        {LANGUAGE_OPTIONS.map(
          (option) => (
            <button
              key={
                option.value
              }
              className={
                language ===
                option.value
                  ? "active"
                  : ""
              }
              onClick={() =>
                changeLanguage(
                  option.value
                )
              }
            >
              {
                option.label
              }
            </button>
          )
        )}
      </div>

      <div className="controls">
        <button
          onClick={() => {
            setPageNumber(
              (page) =>
                Math.max(
                  1,
                  page - 1
                )
            );

            setSelectedText("");
            setPopupPosition(null);
          }}
          disabled={
            pageNumber <= 1
          }
        >
          이전 페이지
        </button>

        <div className="page-number">
          <input
            type="number"
            min="1"
            max={
              pdf?.numPages
            }
            value={
              pageInput
            }
            onChange={(
              event
            ) => {
              setPageInput(
                event.target
                  .value
              );
            }}
            onKeyDown={(
              event
            ) => {
              if (
                event.key ===
                "Enter"
              ) {
                goToPage(
                  pageInput
                );
              }
            }}
            onBlur={() => {
              goToPage(
                pageInput
              );
            }}
          />

          <span>
            /{" "}
            {
              pdf?.numPages
            }
          </span>
        </div>

        <button
          onClick={() => {
            if (!pdf) {
              return;
            }

            setPageNumber(
              (page) =>
                Math.min(
                  pdf.numPages,
                  page + 1
                )
            );

            setSelectedText("");
            setPopupPosition(null);
          }}
          disabled={
            !pdf ||
            pageNumber >=
              pdf.numPages
          }
        >
          다음 페이지
        </button>

        <div className="zoom-controls">
          <button
            onClick={zoomOut}
            disabled={
              scale <= 0.75
            }
          >
            −
          </button>

          <span>
            {Math.round(
              (scale / 1.5) *
                100
            )}
            %
          </span>

          <button
            onClick={zoomIn}
            disabled={
              scale >= 3
            }
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
        <canvas
          ref={canvasRef}
        />

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
              left:
                popupPosition.left,

              top:
                popupPosition.top,
            }}
          >
            <span className="popup-text">
              {selectedText}
            </span>

            <button
              className="speak-button"
              onMouseDown={(
                event
              ) => {
                event.preventDefault();
              }}
              onClick={
                speakText
              }
              title="읽어주기"
            >
              🔊
            </button>
          </div>
        )}

      {translationOpen && (
        <div className="dictionary-panel">
          <h3>
            🌐 Translation
          </h3>

          <div className="translation-original">
            <span>
              {
                translationText
              }
            </span>

            <button
              className="translation-speak-button"
              onClick={
                speakTranslationText
              }
              title="원문 듣기"
            >
              🔊
            </button>
          </div>

          <div className="pronunciation-panel">
            <h3>
              🔊 Pronunciation
            </h3>

            <div className="pronunciation-input-row">
              <input
                type="text"
                value={
                  ttsText
                }
                onChange={(
                  event
                ) => {
                  setTtsText(
                    event.target
                      .value
                  );
                }}
                onKeyDown={(
                  event
                ) => {
                  if (
                    event.key ===
                    "Enter"
                  ) {
                    speakInputText();
                  }
                }}
                placeholder="단어나 문장을 입력하세요"
              />

              <button
                onClick={
                  speakInputText
                }
                disabled={
                  !ttsText.trim()
                }
                title="발음 듣기"
              >
                🔊
              </button>
            </div>
          </div>

          {translationResult?.error ? (
            <p>
              {
                translationResult.error
              }
            </p>
          ) : translationResult ? (
            <div>
              {translationResult.translations?.map(
                (
                  translation,
                  index
                ) => (
                  <div
                    key={
                      index
                    }
                    className="dictionary-translation"
                  >
                    <span>
                      {
                        translation.languageName
                      }
                    </span>

                    <strong>
                      {
                        translation.text
                      }
                    </strong>
                  </div>
                )
              )}
            </div>
          ) : (
            <p>
              텍스트를 선택하세요.
            </p>
          )}
        </div>
      )}

      {/* =========================
    오늘의 단어
    ========================= */}

<div className="today-words-panel">
  <div className="today-words-title">
    오늘 찾아본 단어
  </div>

  <div className="today-words-header">
    <button
      className="date-move-button"
      onClick={() => {
        const date =
          parseDateKey(selectedDate);

        date.setDate(
          date.getDate() - 1
        );

        setSelectedDate(
          formatDateKey(date)
        );
      }}
    >
      ←
    </button>

    <h3>
      📚 {selectedDate}
    </h3>

    <button
      className="date-move-button"
      onClick={() => {
        const date =
          parseDateKey(selectedDate);

        const today =
          getLocalDateString();

        date.setDate(
          date.getDate() + 1
        );

        const nextDate =
          formatDateKey(date);

        if (nextDate <= today) {
          setSelectedDate(nextDate);
        }
      }}
      disabled={
        selectedDate ===
        getLocalDateString()
      }
    >
      →
    </button>
  </div>

  {todayWords.length === 0 ? (
    <p className="today-words-empty">
      {selectedDate}
      에는 아직 저장된
      단어가 없습니다.
    </p>
  ) : (
    <div className="today-words-list">
  {todayWords.map(
        (word) => (
          <div
            key={word.id}
            className="today-word-item"
            onContextMenu={(event) => {
  event.preventDefault();
  event.stopPropagation();

  const meaning =
    word.meaning ||
    [
      ...wordbookWords,
      ...homeWords,
      ...homeMonthWords,
    ].find(
      (currentWord) =>
        currentWord.id === word.id
    )?.meaning ||
    "뜻이 등록되지 않았습니다.";

  setTodayWordMenu({
    wordId: word.id,
    meaning: meaning,
    x: event.clientX,
    y: event.clientY,
    deleteOpen: false,
  });
}}
          >
            <div className="today-word-left">
              <span className="today-word-text">
                {word.word}
              </span>

              <button
                className="today-word-speak-button"
                onClick={async (event) => {
                  event.stopPropagation();

                  try {
                    const response =
                      await fetch(
                        "/api/tts",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type":
                              "application/json",
                          },
                          body:
                            JSON.stringify({
                              text:
                                word.word,
                              language:
                                word.language,
                            }),
                        }
                      );

                    const data =
                      await response.json();

                    if (!response.ok) {
                      console.error(data);

                      alert(
                        "TTS 오류가 발생했습니다."
                      );

                      return;
                    }

                    const audio =
                      new Audio(
                        "data:audio/mp3;base64," +
                          data.audioContent
                      );

                    await audio.play();

                    await recordWordPlayToDatabase(
                      word.word,
                      word.language,
                      word.pdfId,
                      selectedDate
                    );

                    const updatedWords =
                      await getTodayWordsFromDatabase(
                        word.pdfId,
                        word.language,
                        selectedDate
                      );

                    setTodayWords(
                      updatedWords
                    );

                    const dates =
                      await getStudyDatesFromDatabase(
                        language
                      );

                    setStudyDates(dates);
                  } catch (error) {
                    console.error(error);

                    alert(
                      "TTS 서버에 연결할 수 없습니다."
                    );
                  }
                }}
                title="발음 듣기"
              >
                🔊
              </button>
            </div>

            <button
              className="today-word-star-button"
              onClick={async (event) => {
                event.stopPropagation();

                try {
                  await toggleWordStarInDatabase(
                    word.id
                  );

                  const words =
                    await getTodayWordsFromDatabase(
                      word.pdfId,
                      word.language,
                      selectedDate
                    );

                  setTodayWords(words);
                } catch (error) {
                  console.error(error);

                  alert(
                    "단어장 등록에 실패했습니다."
                  );
                }
              }}
              title={
                word.isStarred
                  ? "단어장에서 제거"
                  : "단어장에 등록"
              }
            >
              {word.isStarred
                ? "★"
                : "☆"}
            </button>
          </div>
        )
      )}
    </div>
  )}
</div>

{/* =========================
    오늘의 단어 뜻 / 삭제 메뉴
    ========================= */}

{todayWordMenu && (
  <div
    className="today-word-context-menu"
    style={{
      left: todayWordMenu.x,
      top: todayWordMenu.y,
    }}
    onMouseDown={(event) => {
      event.stopPropagation();
    }}
  >
    <span className="today-word-context-meaning">
      {todayWordMenu.meaning}
    </span>

    <button
      className="today-word-context-more"
      onClick={() => {
        setTodayWordMenu(
          (previous) => ({
            ...previous,
            deleteOpen:
              !previous.deleteOpen,
          })
        );
      }}
      title="더보기"
    >
      ⋮
    </button>

    {todayWordMenu.deleteOpen && (
      <button
        className="today-word-context-delete"
        onClick={async () => {
          try {
            await deleteWordFromDatabase(
              todayWordMenu.wordId
            );

            if (rememberedPdf?.id) {
              const words =
                await getTodayWordsFromDatabase(
                  rememberedPdf.id,
                  language,
                  selectedDate
                );

              setTodayWords(words);
            }

            const dates =
              await getStudyDatesFromDatabase(
                language
              );

            setStudyDates(dates);

            setTodayWordMenu(null);
          } catch (error) {
            console.error(error);

            alert(
              "단어를 삭제하지 못했습니다."
            );
          }
        }}
      >
        삭제
      </button>
    )}
  </div>
)}
    </div>
  );
}

export default App;






