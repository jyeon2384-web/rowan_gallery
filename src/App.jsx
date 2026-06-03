import { useState, useEffect, useRef, useCallback } from "react";

// ── 설정 ──────────────────────────────────────────────────────────
const BABY_NAME = "로안";
const BABY_BIRTHDATE = new Date("2026-03-11T16:12:00");

const GDRIVE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  clientId: "YOUR_CLIENT_ID",
  folderId: "YOUR_FOLDER_ID",
  scope: "https://www.googleapis.com/auth/drive.file",
};

// 보안 질문 (답변은 소문자 비교)
const SECURITY_Q = "로안이 태어난 병원 이름은?";
const SECURITY_A = "세브란스"; // ← 원하는 답변으로 변경

const PW_STORAGE_KEY = "rowan_admin_pw";
const LIKES_STORAGE_KEY = "rowan_likes";

function getSavedPw() {
  return localStorage.getItem(PW_STORAGE_KEY) || "rowan2026";
}
function getLikes() {
  try { return JSON.parse(localStorage.getItem(LIKES_STORAGE_KEY)) || []; } catch { return []; }
}
function saveLikes(arr) {
  localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(arr));
}

// ── 날짜 계산 ─────────────────────────────────────────────────────
function calcAge(date) {
  const birth = BABY_BIRTHDATE;
  const d = new Date(date);
  const diffMs = d - birth;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null; // 탄생 전 → null로 처리
  const totalMonths = Math.floor(diffDays / 30.44);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const weeks = Math.floor((diffDays % 30) / 7);
  let label, groupKey, groupOrder;
  if (diffDays < 30) {
    label = `D+${diffDays}일`;
    groupKey = "D+0~29일 (신생아)";
    groupOrder = 0;
  } else if (totalMonths < 12) {
    label = weeks > 0 ? `${totalMonths}개월 ${weeks}주` : `${totalMonths}개월`;
    groupKey = `${totalMonths}개월`;
    groupOrder = totalMonths;
  } else {
    label = months > 0 ? `${years}년 ${months}개월` : `${years}년`;
    groupKey = months > 0 ? `${years}년 ${months}개월` : `${years}년`;
    groupOrder = years * 12 + months + 12;
  }
  return { diffDays, totalMonths, years, months, weeks, label, groupKey, groupOrder };
}

function getDaysOld(date) {
  return Math.floor((new Date(date) - BABY_BIRTHDATE) / (1000 * 60 * 60 * 24));
}

function getTodayAge() {
  const now = new Date();
  const diffMs = now - BABY_BIRTHDATE;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { diffDays: 0, display: "탄생 전" };
  const totalMonths = Math.floor(diffDays / 30.44);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const weeks = Math.floor((diffDays % 30) / 7);
  const yStr = years > 0 ? `${years}년 ` : "";
  const mStr = `${months}개월 `;
  const wStr = `${weeks}주`;
  return { diffDays, display: `${yStr}${mStr}${wStr}` };
}

function buildPeriodOptions(items) {
  const groups = new Map();
  items.forEach((item) => {
    const age = calcAge(item.date);
    if (!age) return; // 탄생 전 제외
    if (!groups.has(age.groupKey)) groups.set(age.groupKey, age.groupOrder);
  });
  const sorted = [...groups.entries()].sort((a, b) => a[1] - b[1]);
  return [["all", "전체 기간"], ...sorted.map(([k]) => [k, k])];
}

// ── 더미 데이터 ───────────────────────────────────────────────────
const DEMO_ITEMS = [
  { id: "1", name: "신생아.jpg", type: "photo", date: "2026-03-11", thumb: null, url: null },
  { id: "2", name: "첫미소.jpg", type: "photo", date: "2026-04-02", thumb: null, url: null },
  { id: "3", name: "목욕영상.mp4", type: "video", date: "2026-04-15", thumb: null, url: null },
  { id: "4", name: "2개월.jpg", type: "photo", date: "2026-05-11", thumb: null, url: null },
  { id: "5", name: "웃음소리.mp4", type: "video", date: "2026-05-20", thumb: null, url: null },
  { id: "6", name: "뒤집기.mp4", type: "video", date: "2026-06-01", thumb: null, url: null },
];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export default function BabyGallery() {
  const [items, setItems] = useState(DEMO_ITEMS);
  const [filter, setFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [likeFilter, setLikeFilter] = useState(false);
  const [likes, setLikes] = useState(getLikes());
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [pwError, setPwError] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().split("T")[0]);
  const [lightbox, setLightbox] = useState(null);
  const [gdriveReady, setGdriveReady] = useState(false);
  const [tick, setTick] = useState(0);
  const fileRef = useRef();

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      window.gapi.load("client:auth2", async () => {
        try {
          await window.gapi.client.init({
            apiKey: GDRIVE_CONFIG.apiKey,
            clientId: GDRIVE_CONFIG.clientId,
            scope: GDRIVE_CONFIG.scope,
            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
          });
          setGdriveReady(true);
          loadDriveFiles();
        } catch (e) { console.warn("Drive API 초기화 실패 (데모 모드):", e); }
      });
    };
    document.head.appendChild(script);
  }, []);

  const loadDriveFiles = useCallback(async () => {
    if (!window.gapi?.client?.drive) return;
    try {
      const res = await window.gapi.client.drive.files.list({
        q: `'${GDRIVE_CONFIG.folderId}' in parents and trashed=false`,
        fields: "files(id,name,mimeType,createdTime,thumbnailLink,webContentLink,webViewLink,description)",
        orderBy: "createdTime",
        pageSize: 200,
      });
      const files = res.result.files || [];
      const mapped = files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.mimeType.startsWith("video/") ? "video" : "photo",
        date: f.description || f.createdTime?.split("T")[0] || new Date().toISOString().split("T")[0],
        thumb: f.thumbnailLink,
        url: f.webContentLink || f.webViewLink,
      }));
      if (mapped.length > 0) setItems(mapped);
    } catch (e) { console.warn("Drive 파일 로드 실패:", e); }
  }, []);

  // 좋아요 토글
  const toggleLike = (id) => {
    const next = likes.includes(id) ? likes.filter((l) => l !== id) : [...likes, id];
    setLikes(next);
    saveLikes(next);
  };

  // 삭제 (관리자)
  const handleDelete = async (item) => {
    if (!window.confirm(`"${item.name}" 을 삭제할까요?`)) return;
    // Drive 삭제 시도
    if (gdriveReady && window.gapi?.auth2?.getAuthInstance()?.isSignedIn?.get()) {
      try {
        const token = window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
        await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) { console.warn("Drive 삭제 실패:", e); }
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    // 좋아요에서도 제거
    const next = likes.filter((l) => l !== item.id);
    setLikes(next); saveLikes(next);
  };

  // 로그인
  const handleLogin = () => {
    if (pwInput === getSavedPw()) {
      setIsAdmin(true); setShowLogin(false); setPwInput(""); setPwError(false);
    } else { setPwError(true); }
  };

  // 업로드
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    setUploadProgress(files.map((f) => ({ name: f.name, done: false })));
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (gdriveReady && window.gapi?.auth2?.getAuthInstance()?.isSignedIn?.get()) {
        try {
          const token = window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
          const metadata = { name: file.name, parents: [GDRIVE_CONFIG.folderId], description: uploadDate };
          const form = new FormData();
          form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
          form.append("file", file);
          await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
          });
        } catch (err) { console.warn("Drive 업로드 실패:", err); }
      }
      const localUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/");
      setItems((prev) => [...prev, {
        id: `local-${Date.now()}-${i}`, name: file.name,
        type: isVideo ? "video" : "photo", date: uploadDate,
        thumb: isVideo ? null : localUrl, url: localUrl,
      }]);
      setUploadProgress((prev) => prev.map((p, idx) => idx === i ? { ...p, done: true } : p));
    }
    setTimeout(() => { setUploading(false); setUploadProgress([]); if (gdriveReady) loadDriveFiles(); }, 1200);
    e.target.value = "";
  };

  // 필터
  const periodOptions = buildPeriodOptions(items);
  const filtered = items.filter((it) => {
    const age = calcAge(it.date);
    if (!age) return false; // 탄생 전 항상 제외
    const typeOk = filter === "all" || it.type === filter;
    const periodOk = periodFilter === "all" || age.groupKey === periodFilter;
    const likeOk = !likeFilter || likes.includes(it.id);
    return typeOk && periodOk && likeOk;
  });
  const sorted = [...filtered].sort((a, b) => getDaysOld(a.date) - getDaysOld(b.date));
  const grouped = sorted.reduce((acc, item) => {
    const age = calcAge(item.date);
    if (!age) return acc;
    if (!acc[age.groupKey]) acc[age.groupKey] = [];
    acc[age.groupKey].push(item);
    return acc;
  }, {});

  const { diffDays, display: ageDisplay } = getTodayAge();

  return (
    <div style={S.root}>
      <div style={S.bgBlob1} /><div style={S.bgBlob2} />

      {/* ── 헤더 ── */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.headerLeft}>
            <h1 style={S.headerTitle}>✦ 로안 갤러리 ✦</h1>
            <div style={S.headerBirth}>✨ Birth 2026.03.11 PM 4:12</div>
            <div style={S.headerAge}>
              💕 D+<strong>{String(diffDays).padStart(3, "0")}일</strong>
              &nbsp;&nbsp;
              <span style={S.headerAgeDetail}>({ageDisplay})</span>
            </div>
          </div>
          <div style={S.headerRight}>
            <button style={isAdmin ? S.btnAdminActive : S.btnAdmin}
              onClick={() => isAdmin ? setIsAdmin(false) : setShowLogin(true)}>
              {isAdmin ? "🔓 관리자 모드" : "🔒 관리자"}
            </button>
            {isAdmin && (
              <button style={S.btnChangePw} onClick={() => setShowChangePw(true)}>
                🔑 비번 변경
              </button>
            )}
          </div>
        </div>

        {/* 필터 바 */}
        <div style={S.filterBar}>
          <div style={S.tabs}>
            {[["all", "전체"], ["photo", "📷 사진"], ["video", "🎬 영상"]].map(([v, label]) => (
              <button key={v} style={filter === v ? { ...S.tab, ...S.tabActive } : S.tab}
                onClick={() => setFilter(v)}>{label}</button>
            ))}
          </div>

          {/* 좋아요 필터 */}
          <button
            style={likeFilter ? { ...S.tab, ...S.tabLikeActive } : { ...S.tab, ...S.tabLike }}
            onClick={() => setLikeFilter((v) => !v)}>
            {likeFilter ? "❤️ 좋아요만" : "🤍 좋아요만"}
          </button>

          <select style={S.dropdown} value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}>
            {periodOptions.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>

          <span style={S.countBadge}>{filtered.length}개</span>
        </div>
      </header>

      {/* ── 업로드 바 ── */}
      {isAdmin && (
        <div style={S.uploadBar}>
          <span style={S.uploadBarText}>📁 여러 파일 동시 선택 가능</span>
          <div style={S.datePickerWrap}>
            <label style={S.dateLabel}>📅 촬영일</label>
            <input type="date" style={S.datePicker} value={uploadDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => setUploadDate(e.target.value)} />
          </div>
          <button style={S.btnUpload} onClick={() => fileRef.current.click()}>+ 업로드</button>
          <input ref={fileRef} type="file" multiple accept="image/*,video/*"
            style={{ display: "none" }} onChange={handleUpload} />
        </div>
      )}

      {uploading && (
        <div style={S.progressWrap}>
          {uploadProgress.map((p, i) => (
            <div key={i} style={S.progressItem}>
              <span style={S.progressName}>{p.name}</span>
              <div style={S.progressBar}><div style={{ ...S.progressFill, width: p.done ? "100%" : "60%" }} /></div>
              {p.done && <span style={S.progressDone}>✓</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── 갤러리 ── */}
      <main style={S.main}>
        {Object.entries(grouped).map(([ageLabel, grpItems]) => (
          <section key={ageLabel} style={S.group}>
            <div style={S.groupHeader}>
              <span style={S.groupLabel}>{ageLabel}</span>
              <span style={S.groupCount}>{grpItems.length}개</span>
            </div>
            <div style={S.grid}>
              {grpItems.map((item) => (
                <MediaCard key={item.id} item={item}
                  liked={likes.includes(item.id)}
                  onLike={(e) => { e.stopPropagation(); toggleLike(item.id); }}
                  onDelete={isAdmin ? (e) => { e.stopPropagation(); handleDelete(item); } : null}
                  onClick={() => setLightbox(item)} />
              ))}
            </div>
          </section>
        ))}
        {filtered.length === 0 && (
          <div style={S.empty}>
            <div style={S.emptyIcon}>{likeFilter ? "🤍" : "🌱"}</div>
            <p>{likeFilter ? "좋아요한 항목이 없어요" : "아직 등록된 미디어가 없어요"}</p>
          </div>
        )}
      </main>

      {lightbox && (
        <Lightbox item={lightbox} onClose={() => setLightbox(null)}
          items={sorted} setLightbox={setLightbox}
          liked={likes.includes(lightbox.id)} onLike={() => toggleLike(lightbox.id)} />
      )}

      {/* ── 로그인 모달 ── */}
      {showLogin && (
        <div style={S.modalOverlay} onClick={() => setShowLogin(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={S.modalTitle}>🔐 관리자 로그인</h2>
            <div style={S.pwWrap}>
              <input
                type={pwVisible ? "text" : "password"}
                placeholder="비밀번호 입력"
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                style={pwError ? { ...S.pwInput, ...S.pwInputError } : S.pwInput}
                autoFocus />
              <button style={S.eyeBtn} onClick={() => setPwVisible((v) => !v)}>
                {pwVisible ? "🙈" : "👁️"}
              </button>
            </div>
            {pwError && <p style={S.pwErrorMsg}>비밀번호가 틀렸어요 🙅</p>}
            <div style={S.modalBtns}>
              <button style={S.btnCancel} onClick={() => setShowLogin(false)}>취소</button>
              <button style={S.btnConfirm} onClick={handleLogin}>확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 비밀번호 변경 모달 ── */}
      {showChangePw && (
        <ChangePwModal onClose={() => setShowChangePw(false)} />
      )}
    </div>
  );
}

// ── 비밀번호 변경 모달 ────────────────────────────────────────────
function ChangePwModal({ onClose }) {
  const [step, setStep] = useState(1); // 1: 보안질문, 2: 새 비번
  const [answer, setAnswer] = useState("");
  const [answerError, setAnswerError] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [newPwVisible, setNewPwVisible] = useState(false);
  const [pwMatchError, setPwMatchError] = useState(false);
  const [done, setDone] = useState(false);

  const checkAnswer = () => {
    if (answer.trim() === SECURITY_A.trim()) {
      setStep(2); setAnswerError(false);
    } else { setAnswerError(true); }
  };

  const changePw = () => {
    if (newPw.length < 4) { setPwMatchError(true); return; }
    if (newPw !== newPw2) { setPwMatchError(true); return; }
    localStorage.setItem(PW_STORAGE_KEY, newPw);
    setDone(true);
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={S.modalTitle}>비밀번호 변경 완료!</h2>
            <button style={{ ...S.btnConfirm, width: "100%" }} onClick={onClose}>닫기</button>
          </>
        ) : step === 1 ? (
          <>
            <h2 style={S.modalTitle}>🔑 비밀번호 변경</h2>
            <p style={S.securityQ}>{SECURITY_Q}</p>
            <input type="text" placeholder="답변 입력" value={answer}
              onChange={(e) => { setAnswer(e.target.value); setAnswerError(false); }}
              onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
              style={answerError ? { ...S.pwInput, ...S.pwInputError } : S.pwInput} autoFocus />
            {answerError && <p style={S.pwErrorMsg}>답변이 틀렸어요 🙅</p>}
            <div style={S.modalBtns}>
              <button style={S.btnCancel} onClick={onClose}>취소</button>
              <button style={S.btnConfirm} onClick={checkAnswer}>확인</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={S.modalTitle}>🔑 새 비밀번호 설정</h2>
            <div style={S.pwWrap}>
              <input type={newPwVisible ? "text" : "password"} placeholder="새 비밀번호 (4자 이상)"
                value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwMatchError(false); }}
                style={S.pwInput} autoFocus />
              <button style={S.eyeBtn} onClick={() => setNewPwVisible((v) => !v)}>
                {newPwVisible ? "🙈" : "👁️"}
              </button>
            </div>
            <div style={{ ...S.pwWrap, marginTop: 8 }}>
              <input type={newPwVisible ? "text" : "password"} placeholder="비밀번호 확인"
                value={newPw2} onChange={(e) => { setNewPw2(e.target.value); setPwMatchError(false); }}
                onKeyDown={(e) => e.key === "Enter" && changePw()}
                style={pwMatchError ? { ...S.pwInput, ...S.pwInputError } : S.pwInput} />
            </div>
            {pwMatchError && <p style={S.pwErrorMsg}>{newPw.length < 4 ? "4자 이상 입력해주세요" : "비밀번호가 일치하지 않아요"}</p>}
            <div style={S.modalBtns}>
              <button style={S.btnCancel} onClick={onClose}>취소</button>
              <button style={S.btnConfirm} onClick={changePw}>변경</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── 미디어 카드 ───────────────────────────────────────────────────
function MediaCard({ item, onClick, liked, onLike, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const isVideo = item.type === "video";
  const age = calcAge(item.date);
  return (
    <div style={{ ...S.card,
      transform: hovered ? "scale(1.03)" : "scale(1)",
      boxShadow: hovered ? "0 12px 40px rgba(255,175,130,0.35)" : "0 4px 16px rgba(0,0,0,0.08)",
    }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={onClick}>
      <div style={S.cardThumb}>
        {item.thumb ? <img src={item.thumb} alt={item.name} style={S.thumbImg} />
          : <div style={S.thumbPlaceholder}>{isVideo ? "🎬" : "📷"}</div>}
        {isVideo && <div style={S.videoOverlay}>▶</div>}
        <div style={S.typeBadge}>{isVideo ? "영상" : "사진"}</div>
        {/* 하트 버튼 */}
        <button style={{ ...S.heartBtn, color: liked ? "#e8304a" : "rgba(255,255,255,0.8)" }}
          onClick={onLike}>{liked ? "❤️" : "🤍"}</button>
        {/* 삭제 버튼 (관리자) */}
        {onDelete && (
          <button style={S.deleteBtn} onClick={onDelete}>🗑️</button>
        )}
      </div>
      <div style={S.cardInfo}>
        <div style={S.cardDate}>{item.date}</div>
        <div style={S.cardAge}>{age?.label || ""}</div>
      </div>
    </div>
  );
}

// ── 라이트박스 ────────────────────────────────────────────────────
function Lightbox({ item, onClose, items, setLightbox, liked, onLike }) {
  const idx = items.findIndex((i) => i.id === item.id);
  const prev = () => idx > 0 && setLightbox(items[idx - 1]);
  const next = () => idx < items.length - 1 && setLightbox(items[idx + 1]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  const age = calcAge(item.date);
  return (
    <div style={S.lbOverlay} onClick={onClose}>
      <div style={S.lbBox} onClick={(e) => e.stopPropagation()}>
        <button style={S.lbClose} onClick={onClose}>✕</button>
        <button style={{ ...S.lbHeart, color: liked ? "#e8304a" : "#ccc" }} onClick={onLike}>
          {liked ? "❤️" : "🤍"}
        </button>
        <div style={S.lbMedia}>
          {item.type === "video"
            ? item.url ? <video src={item.url} controls style={S.lbVideo} />
              : <div style={S.lbPlaceholder}>🎬<br />영상 미리보기</div>
            : item.url ? <img src={item.url} alt={item.name} style={S.lbImg} />
              : <div style={S.lbPlaceholder}>📷<br />사진 미리보기</div>}
        </div>
        <div style={S.lbMeta}>
          <span style={S.lbAge}>{age?.label || ""}</span>
          <span style={S.lbDate}>{item.date}</span>
          <span style={S.lbName}>{item.name}</span>
        </div>
        <div style={S.lbNav}>
          <button style={idx === 0 ? S.lbNavBtnDisabled : S.lbNavBtn} onClick={prev}>← 이전</button>
          <span style={S.lbCounter}>{idx + 1} / {items.length}</span>
          <button style={idx === items.length - 1 ? S.lbNavBtnDisabled : S.lbNavBtn} onClick={next}>다음 →</button>
        </div>
      </div>
    </div>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────
const S = {
  root: { minHeight: "100vh", background: "#fff9f5", fontFamily: "'Nanum Myeongjo', 'Georgia', serif", position: "relative", overflowX: "hidden" },
  bgBlob1: { position: "fixed", top: -120, right: -120, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, #ffe0cc88 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 },
  bgBlob2: { position: "fixed", bottom: -80, left: -80, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, #ffd6e888 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 },

  header: { position: "sticky", top: 0, zIndex: 100, background: "rgba(255,249,245,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid #fde8d8", padding: "0 24px" },
  headerInner: { maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0 10px" },
  headerLeft: { display: "flex", flexDirection: "column", gap: 4 },
  headerTitle: { margin: 0, fontSize: "clamp(22px, 4vw, 34px)", fontWeight: 800, color: "#3a2010", letterSpacing: "0.02em" },
  headerBirth: { fontSize: 14, color: "#b07050" },
  headerAge: { fontSize: 15, color: "#3a2010" },
  headerAgeDetail: { fontSize: 13, color: "#a07060" },
  headerRight: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" },

  btnAdmin: { padding: "8px 16px", borderRadius: 20, border: "1.5px solid #e8906a", background: "transparent", color: "#e8906a", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  btnAdminActive: { padding: "8px 16px", borderRadius: 20, border: "1.5px solid #e8906a", background: "#e8906a", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  btnChangePw: { padding: "6px 14px", borderRadius: 20, border: "1.5px solid #c0a090", background: "transparent", color: "#a07060", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },

  filterBar: { maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 8, padding: "8px 0 12px", flexWrap: "wrap" },
  tabs: { display: "flex", gap: 6 },
  tab: { padding: "6px 16px", borderRadius: 20, border: "1.5px solid #f0d0c0", background: "transparent", color: "#b08070", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  tabActive: { background: "#e8906a", borderColor: "#e8906a", color: "#fff", fontWeight: 600 },
  tabLike: { borderColor: "#f0b0c0" , color: "#c07080" },
  tabLikeActive: { background: "#e8304a", borderColor: "#e8304a", color: "#fff", fontWeight: 600 },

  dropdown: { padding: "6px 12px", borderRadius: 20, border: "1.5px solid #f0d0c0", background: "#fff9f5", color: "#806050", fontSize: 13, cursor: "pointer", fontFamily: "inherit", outline: "none" },
  countBadge: { marginLeft: "auto", fontSize: 12, color: "#c09080", background: "#fde8d8", padding: "4px 10px", borderRadius: 12 },

  uploadBar: { maxWidth: 1100, margin: "16px auto 0", padding: "12px 24px", background: "#fff3ee", border: "1.5px dashed #f0a888", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  uploadBarText: { fontSize: 14, color: "#a07060" },
  datePickerWrap: { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" },
  dateLabel: { fontSize: 13, color: "#a07060" },
  datePicker: { padding: "6px 10px", borderRadius: 10, border: "1.5px solid #f0d0c0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: "#3a2010" },
  btnUpload: { padding: "8px 20px", borderRadius: 20, border: "none", background: "#e8906a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },

  progressWrap: { maxWidth: 1100, margin: "12px auto 0", padding: "0 24px", display: "flex", flexDirection: "column", gap: 6 },
  progressItem: { display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 8, padding: "8px 12px", border: "1px solid #f0d0c0" },
  progressName: { fontSize: 12, color: "#806050", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  progressBar: { width: 120, height: 6, background: "#fde8d8", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", background: "#e8906a", borderRadius: 3, transition: "width 0.4s" },
  progressDone: { color: "#e8906a", fontWeight: 700, fontSize: 14 },

  main: { maxWidth: 1100, margin: "0 auto", padding: "24px 24px 80px" },
  group: { marginBottom: 40 },
  groupHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  groupLabel: { fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "#fff", background: "#e8906a", padding: "4px 14px", borderRadius: 20 },
  groupCount: { fontSize: 12, color: "#c09080" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 },

  card: { borderRadius: 14, overflow: "hidden", background: "#fff", cursor: "pointer", transition: "transform 0.25s, box-shadow 0.25s", border: "1px solid #f0e0d8" },
  cardThumb: { position: "relative", aspectRatio: "1", overflow: "hidden", background: "#fde8d8", display: "flex", alignItems: "center", justifyContent: "center" },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover" },
  thumbPlaceholder: { fontSize: 36, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "linear-gradient(135deg, #fde8d8, #ffd6e8)" },
  videoOverlay: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)", color: "#fff", fontSize: 28 },
  typeBadge: { position: "absolute", top: 8, right: 8, fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(255,255,255,0.85)", color: "#806050", fontWeight: 600 },
  heartBtn: { position: "absolute", bottom: 8, right: 8, background: "none", border: "none", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" },
  deleteBtn: { position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.4)", border: "none", fontSize: 14, cursor: "pointer", borderRadius: 8, padding: "3px 6px", lineHeight: 1 },
  cardInfo: { padding: "8px 10px" },
  cardDate: { fontSize: 11, color: "#c09080" },
  cardAge: { fontSize: 13, fontWeight: 700, color: "#3a2010", marginTop: 2 },

  lbOverlay: { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(30,10,5,0.88)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" },
  lbBox: { background: "#fff9f5", borderRadius: 20, width: "min(92vw, 760px)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" },
  lbClose: { position: "absolute", top: 12, right: 14, background: "none", border: "none", fontSize: 18, color: "#a07060", cursor: "pointer", zIndex: 10 },
  lbHeart: { position: "absolute", top: 12, right: 48, background: "none", border: "none", fontSize: 20, cursor: "pointer", zIndex: 10 },
  lbMedia: { flex: 1, background: "#fde8d8", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, maxHeight: "65vh" },
  lbImg: { maxWidth: "100%", maxHeight: "65vh", objectFit: "contain" },
  lbVideo: { maxWidth: "100%", maxHeight: "65vh" },
  lbPlaceholder: { textAlign: "center", fontSize: 48, color: "#c09080", padding: 40, lineHeight: 1.6 },
  lbMeta: { display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: "1px solid #fde8d8" },
  lbAge: { background: "#e8906a", color: "#fff", fontSize: 13, fontWeight: 700, padding: "3px 12px", borderRadius: 12 },
  lbDate: { fontSize: 13, color: "#a07060" },
  lbName: { fontSize: 12, color: "#c09080", flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  lbNav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 16px" },
  lbNavBtn: { padding: "7px 16px", borderRadius: 16, border: "1.5px solid #e8906a", background: "transparent", color: "#e8906a", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  lbNavBtnDisabled: { padding: "7px 16px", borderRadius: 16, border: "1.5px solid #e0d0c8", background: "transparent", color: "#d0c0b8", fontSize: 13, cursor: "default", fontFamily: "inherit" },
  lbCounter: { fontSize: 13, color: "#a07060" },

  modalOverlay: { position: "fixed", inset: 0, zIndex: 2000, background: "rgba(30,10,5,0.6)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" },
  modal: { background: "#fff9f5", borderRadius: 20, padding: "32px 28px", width: "min(88vw, 360px)", textAlign: "center" },
  modalTitle: { margin: "0 0 20px", fontSize: 20, color: "#3a2010" },
  securityQ: { fontSize: 14, color: "#806050", marginBottom: 12, lineHeight: 1.6 },
  pwWrap: { position: "relative", display: "flex", alignItems: "center" },
  pwInput: { width: "100%", boxSizing: "border-box", padding: "12px 44px 12px 16px", borderRadius: 10, border: "1.5px solid #f0d0c0", fontSize: 16, fontFamily: "inherit", outline: "none", background: "#fff" },
  pwInputError: { borderColor: "#e05040" },
  pwErrorMsg: { color: "#e05040", fontSize: 13, margin: "6px 0 0" },
  eyeBtn: { position: "absolute", right: 12, background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: 0 },
  modalBtns: { display: "flex", gap: 10, marginTop: 20 },
  btnCancel: { flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e0d0c8", background: "transparent", color: "#a07060", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  btnConfirm: { flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#e8906a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  empty: { textAlign: "center", padding: "80px 20px", color: "#c09080" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
};
