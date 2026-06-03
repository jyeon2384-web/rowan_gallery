import { useState, useEffect, useRef, useCallback } from "react";

// ── 설정 ──────────────────────────────────────────────────────────
const BABY_NAME = "rowan";
const BABY_BIRTHDATE = new Date("2026-03-11");
const ADMIN_PASSWORD = "baby2026"; // ← 원하는 비번으로 변경하세요
const SECURITY_Q = "로안이가 태어난 도시는?(한글,ㅔ)";
const SECURITY_A = "벤쿠버"; // ← 원하는 답변으로 변경

// Google Drive API 설정 (실제 배포 시 본인 키로 교체)
const GDRIVE_CONFIG = {
  apiKey: "AIzaSyC8IyGlB6IDQUs-OOQ8_PWBaDVd3kaneBg",
  clientId: "883112531411-4s7a6s3c19i4qghmt58e32hq1cm3mg07.apps.googleusercontent.com",
  folderId: "1wDwZzUM83CY6V8KOA64_ISPTNcHKOtVs", // 갤러리용 Drive 폴더 ID
  scope: "https://www.googleapis.com/auth/drive.file",
};

// 개월수 계산
function getAgeLabel(date) {
  const birth = BABY_BIRTHDATE;
  const d = new Date(date);
  const diffMs = d - birth;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "탄생 전";
  if (diffDays < 30) return `D+${diffDays}`;
  const months = Math.floor(diffDays / 30);
  const weeks = Math.floor((diffDays % 30) / 7);
  if (months < 12) return weeks > 0 ? `${months}개월 ${weeks}주` : `${months}개월`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths > 0 ? `${years}살 ${remMonths}개월` : `${years}살`;
}

function getDaysOld(date) {
  return Math.floor((new Date(date) - BABY_BIRTHDATE) / (1000 * 60 * 60 * 24));
}

// ── 더미 데이터 (Drive 연동 전 미리보기용) ──────────────────────
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
  const [filter, setFilter] = useState("all"); // all | photo | video
  const [sortGroup, setSortGroup] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [gdriveReady, setGdriveReady] = useState(false);
  const fileRef = useRef();

  // ── Google Drive API 로드 ────────────────────────────────────────
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
        } catch (e) {
          console.warn("Drive API 초기화 실패 (데모 모드로 실행):", e);
        }
      });
    };
    document.head.appendChild(script);
  }, []);

  // ── Drive에서 파일 목록 로드 ────────────────────────────────────
  const loadDriveFiles = useCallback(async () => {
    if (!window.gapi?.client?.drive) return;
    try {
      const res = await window.gapi.client.drive.files.list({
        q: `'${GDRIVE_CONFIG.folderId}' in parents and trashed=false`,
        fields: "files(id,name,mimeType,createdTime,thumbnailLink,webContentLink,webViewLink)",
        orderBy: "createdTime",
        pageSize: 200,
      });
      const files = res.result.files || [];
      const mapped = files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.mimeType.startsWith("video/") ? "video" : "photo",
        date: f.createdTime?.split("T")[0] || new Date().toISOString().split("T")[0],
        thumb: f.thumbnailLink,
        url: f.webContentLink || f.webViewLink,
      }));
      if (mapped.length > 0) setItems(mapped);
    } catch (e) {
      console.warn("Drive 파일 로드 실패:", e);
    }
  }, []);

  // ── 로그인 ───────────────────────────────────────────────────────
  const handleLogin = () => {
    if (pwInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowLogin(false);
      setPwInput("");
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

  // ── 파일 업로드 ─────────────────────────────────────────────────
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    setUploadProgress(files.map((f) => ({ name: f.name, progress: 0, done: false })));

    const today = new Date().toISOString().split("T")[0];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Drive 업로드 시도
      if (gdriveReady && window.gapi?.auth2?.getAuthInstance()?.isSignedIn?.get()) {
        try {
          const token = window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
          const metadata = {
            name: file.name,
            parents: [GDRIVE_CONFIG.folderId],
          };
          const form = new FormData();
          form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
          form.append("file", file);

          await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
        } catch (err) {
          console.warn("Drive 업로드 실패, 로컬 미리보기로 추가:", err);
        }
      }

      // 로컬 미리보기 (Drive 여부 관계없이 즉시 반영)
      const localUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/");
      setItems((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-${i}`,
          name: file.name,
          type: isVideo ? "video" : "photo",
          date: today,
          thumb: isVideo ? null : localUrl,
          url: localUrl,
        },
      ]);

      setUploadProgress((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, progress: 100, done: true } : p))
      );
    }

    setTimeout(() => {
      setUploading(false);
      setUploadProgress([]);
      if (gdriveReady) loadDriveFiles();
    }, 1200);

    e.target.value = "";
  };

  // ── 필터 & 그룹핑 ───────────────────────────────────────────────
  const filtered = items.filter((it) => filter === "all" || it.type === filter);
  const sorted = [...filtered].sort((a, b) => getDaysOld(a.date) - getDaysOld(b.date));

  const grouped = sorted.reduce((acc, item) => {
    const label = getAgeLabel(item.date);
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});

  const todayAge = getAgeLabel(new Date());

  return (
    <div style={styles.root}>
      {/* ── 배경 장식 ── */}
      <div style={styles.bgBlob1} />
      <div style={styles.bgBlob2} />

      {/* ── 헤더 ── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <div style={styles.headerEyebrow}>✦ 우리 가족 갤러리 ✦</div>
            <h1 style={styles.headerTitle}>{BABY_NAME}의 성장일기</h1>
            <div style={styles.headerSub}>
              2026.03.11 탄생 &nbsp;·&nbsp; 오늘 <strong>{todayAge}</strong>
            </div>
          </div>
          <button
            style={isAdmin ? styles.btnAdminActive : styles.btnAdmin}
            onClick={() => (isAdmin ? setIsAdmin(false) : setShowLogin(true))}
          >
            {isAdmin ? "🔓 관리자 모드" : "🔒 관리자"}
          </button>
        </div>

        {/* 필터 탭 */}
        <div style={styles.tabs}>
          {[["all", "전체"], ["photo", "📷 사진"], ["video", "🎬 영상"]].map(([v, label]) => (
            <button
              key={v}
              style={filter === v ? { ...styles.tab, ...styles.tabActive } : styles.tab}
              onClick={() => setFilter(v)}
            >
              {label}
            </button>
          ))}
          <div style={styles.tabSpacer} />
          <span style={styles.countBadge}>{filtered.length}개</span>
        </div>
      </header>

      {/* ── 관리자 업로드 바 ── */}
      {isAdmin && (
        <div style={styles.uploadBar}>
          <span style={styles.uploadBarText}>📁 여러 파일을 한 번에 선택하세요</span>
          <button style={styles.btnUpload} onClick={() => fileRef.current.click()}>
            + 업로드
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={handleUpload}
          />
        </div>
      )}

      {/* ── 업로드 진행 ── */}
      {uploading && (
        <div style={styles.progressWrap}>
          {uploadProgress.map((p, i) => (
            <div key={i} style={styles.progressItem}>
              <span style={styles.progressName}>{p.name}</span>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: p.done ? "100%" : "60%" }} />
              </div>
              {p.done && <span style={styles.progressDone}>✓</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── 갤러리 ── */}
      <main style={styles.main}>
        {Object.entries(grouped).map(([ageLabel, grpItems]) => (
          <section key={ageLabel} style={styles.group}>
            <div style={styles.groupHeader}>
              <span style={styles.groupLabel}>{ageLabel}</span>
              <span style={styles.groupCount}>{grpItems.length}개</span>
            </div>
            <div style={styles.grid}>
              {grpItems.map((item) => (
                <MediaCard key={item.id} item={item} onClick={() => setLightbox(item)} />
              ))}
            </div>
          </section>
        ))}

        {filtered.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>🌱</div>
            <p>아직 등록된 {filter === "photo" ? "사진" : filter === "video" ? "영상" : "미디어"}이 없어요</p>
          </div>
        )}
      </main>

      {/* ── 라이트박스 ── */}
      {lightbox && (
        <Lightbox item={lightbox} onClose={() => setLightbox(null)} items={sorted} setLightbox={setLightbox} />
      )}

      {/* ── 로그인 모달 ── */}
      {showLogin && (
        <div style={styles.modalOverlay} onClick={() => setShowLogin(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>🔐 관리자 로그인</h2>
            <input
              type="password"
              placeholder="비밀번호 입력"
              value={pwInput}
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              style={pwError ? { ...styles.pwInput, ...styles.pwInputError } : styles.pwInput}
              autoFocus
            />
            {pwError && <p style={styles.pwErrorMsg}>비밀번호가 틀렸어요 🙅</p>}
            <div style={styles.modalBtns}>
              <button style={styles.btnCancel} onClick={() => setShowLogin(false)}>취소</button>
              <button style={styles.btnConfirm} onClick={handleLogin}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 미디어 카드 ───────────────────────────────────────────────────
function MediaCard({ item, onClick }) {
  const [hovered, setHovered] = useState(false);
  const isVideo = item.type === "video";

  return (
    <div
      style={{
        ...styles.card,
        transform: hovered ? "scale(1.03)" : "scale(1)",
        boxShadow: hovered
          ? "0 12px 40px rgba(255,175,130,0.35)"
          : "0 4px 16px rgba(0,0,0,0.08)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div style={styles.cardThumb}>
        {item.thumb ? (
          <img src={item.thumb} alt={item.name} style={styles.thumbImg} />
        ) : (
          <div style={styles.thumbPlaceholder}>
            {isVideo ? "🎬" : "📷"}
          </div>
        )}
        {isVideo && <div style={styles.videoOverlay}>▶</div>}
        <div style={styles.typeBadge}>{isVideo ? "영상" : "사진"}</div>
      </div>
      <div style={styles.cardInfo}>
        <div style={styles.cardDate}>{item.date}</div>
        <div style={styles.cardAge}>{getAgeLabel(item.date)}</div>
      </div>
    </div>
  );
}

// ── 라이트박스 ────────────────────────────────────────────────────
function Lightbox({ item, onClose, items, setLightbox }) {
  const idx = items.findIndex((i) => i.id === item.id);

  const prev = () => idx > 0 && setLightbox(items[idx - 1]);
  const next = () => idx < items.length - 1 && setLightbox(items[idx + 1]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div style={styles.lbOverlay} onClick={onClose}>
      <div style={styles.lbBox} onClick={(e) => e.stopPropagation()}>
        <button style={styles.lbClose} onClick={onClose}>✕</button>
        <div style={styles.lbMedia}>
          {item.type === "video" ? (
            item.url ? (
              <video src={item.url} controls style={styles.lbVideo} />
            ) : (
              <div style={styles.lbPlaceholder}>🎬<br/>영상 미리보기</div>
            )
          ) : item.url ? (
            <img src={item.url} alt={item.name} style={styles.lbImg} />
          ) : (
            <div style={styles.lbPlaceholder}>📷<br/>사진 미리보기</div>
          )}
        </div>
        <div style={styles.lbMeta}>
          <span style={styles.lbAge}>{getAgeLabel(item.date)}</span>
          <span style={styles.lbDate}>{item.date}</span>
          <span style={styles.lbName}>{item.name}</span>
        </div>
        <div style={styles.lbNav}>
          <button style={idx === 0 ? styles.lbNavBtnDisabled : styles.lbNavBtn} onClick={prev}>← 이전</button>
          <span style={styles.lbCounter}>{idx + 1} / {items.length}</span>
          <button style={idx === items.length - 1 ? styles.lbNavBtnDisabled : styles.lbNavBtn} onClick={next}>다음 →</button>
        </div>
      </div>
    </div>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    background: "#fff9f5",
    fontFamily: "'Nanum Myeongjo', 'Georgia', serif",
    position: "relative",
    overflowX: "hidden",
  },
  bgBlob1: {
    position: "fixed", top: -120, right: -120,
    width: 400, height: 400, borderRadius: "50%",
    background: "radial-gradient(circle, #ffe0cc88 0%, transparent 70%)",
    pointerEvents: "none", zIndex: 0,
  },
  bgBlob2: {
    position: "fixed", bottom: -80, left: -80,
    width: 300, height: 300, borderRadius: "50%",
    background: "radial-gradient(circle, #ffd6e888 0%, transparent 70%)",
    pointerEvents: "none", zIndex: 0,
  },
  header: {
    position: "sticky", top: 0, zIndex: 100,
    background: "rgba(255,249,245,0.92)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid #fde8d8",
    padding: "0 24px",
  },
  headerInner: {
    maxWidth: 1100, margin: "0 auto",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 0 10px",
  },
  headerEyebrow: {
    fontSize: 11, letterSpacing: "0.2em", color: "#e8906a", textTransform: "uppercase",
    marginBottom: 4,
  },
  headerTitle: {
    margin: 0, fontSize: "clamp(20px, 4vw, 32px)",
    fontWeight: 700, color: "#3a2010",
    letterSpacing: "-0.02em",
  },
  headerSub: {
    marginTop: 4, fontSize: 13, color: "#a07060",
  },
  btnAdmin: {
    padding: "8px 16px", borderRadius: 20,
    border: "1.5px solid #e8906a", background: "transparent",
    color: "#e8906a", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.2s",
  },
  btnAdminActive: {
    padding: "8px 16px", borderRadius: 20,
    border: "1.5px solid #e8906a", background: "#e8906a",
    color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  },
  tabs: {
    maxWidth: 1100, margin: "0 auto",
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 0 12px",
  },
  tab: {
    padding: "6px 16px", borderRadius: 20,
    border: "1.5px solid #f0d0c0", background: "transparent",
    color: "#b08070", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.2s",
  },
  tabActive: {
    background: "#e8906a", borderColor: "#e8906a", color: "#fff",
    fontWeight: 600,
  },
  tabSpacer: { flex: 1 },
  countBadge: {
    fontSize: 12, color: "#c09080",
    background: "#fde8d8", padding: "4px 10px", borderRadius: 12,
  },
  uploadBar: {
    maxWidth: 1100, margin: "16px auto 0",
    padding: "12px 24px",
    background: "#fff3ee",
    border: "1.5px dashed #f0a888",
    borderRadius: 12,
    display: "flex", alignItems: "center", gap: 12,
    mx: 24,
  },
  uploadBarText: { flex: 1, fontSize: 14, color: "#a07060" },
  btnUpload: {
    padding: "8px 20px", borderRadius: 20,
    border: "none", background: "#e8906a", color: "#fff",
    fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  progressWrap: {
    maxWidth: 1100, margin: "12px auto 0",
    padding: "0 24px", display: "flex", flexDirection: "column", gap: 6,
  },
  progressItem: {
    display: "flex", alignItems: "center", gap: 10,
    background: "#fff", borderRadius: 8, padding: "8px 12px",
    border: "1px solid #f0d0c0",
  },
  progressName: { fontSize: 12, color: "#806050", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  progressBar: { width: 120, height: 6, background: "#fde8d8", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", background: "#e8906a", borderRadius: 3, transition: "width 0.4s" },
  progressDone: { color: "#e8906a", fontWeight: 700, fontSize: 14 },
  main: {
    maxWidth: 1100, margin: "0 auto",
    padding: "24px 24px 80px",
  },
  group: { marginBottom: 40 },
  groupHeader: {
    display: "flex", alignItems: "center", gap: 12,
    marginBottom: 16,
  },
  groupLabel: {
    fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
    color: "#fff", background: "#e8906a",
    padding: "4px 14px", borderRadius: 20,
  },
  groupCount: { fontSize: 12, color: "#c09080" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
  },
  card: {
    borderRadius: 14, overflow: "hidden",
    background: "#fff",
    cursor: "pointer",
    transition: "transform 0.25s, box-shadow 0.25s",
    border: "1px solid #f0e0d8",
  },
  cardThumb: {
    position: "relative",
    aspectRatio: "1", overflow: "hidden",
    background: "#fde8d8",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover" },
  thumbPlaceholder: {
    fontSize: 36, display: "flex", alignItems: "center", justifyContent: "center",
    width: "100%", height: "100%",
    background: "linear-gradient(135deg, #fde8d8, #ffd6e8)",
  },
  videoOverlay: {
    position: "absolute", inset: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.25)",
    color: "#fff", fontSize: 28,
  },
  typeBadge: {
    position: "absolute", top: 8, right: 8,
    fontSize: 10, padding: "2px 8px", borderRadius: 10,
    background: "rgba(255,255,255,0.85)", color: "#806050",
    fontWeight: 600, letterSpacing: "0.05em",
  },
  cardInfo: {
    padding: "8px 10px",
  },
  cardDate: { fontSize: 11, color: "#c09080" },
  cardAge: { fontSize: 13, fontWeight: 700, color: "#3a2010", marginTop: 2 },

  // 라이트박스
  lbOverlay: {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(30,10,5,0.88)",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(8px)",
  },
  lbBox: {
    background: "#fff9f5", borderRadius: 20,
    width: "min(92vw, 760px)",
    maxHeight: "92vh",
    overflow: "hidden",
    display: "flex", flexDirection: "column",
    position: "relative",
  },
  lbClose: {
    position: "absolute", top: 12, right: 14,
    background: "none", border: "none",
    fontSize: 18, color: "#a07060", cursor: "pointer", zIndex: 10,
  },
  lbMedia: {
    flex: 1, background: "#fde8d8",
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: 300, maxHeight: "65vh",
  },
  lbImg: { maxWidth: "100%", maxHeight: "65vh", objectFit: "contain" },
  lbVideo: { maxWidth: "100%", maxHeight: "65vh" },
  lbPlaceholder: {
    textAlign: "center", fontSize: 48, color: "#c09080",
    padding: 40, lineHeight: 1.6,
  },
  lbMeta: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 20px",
    borderTop: "1px solid #fde8d8",
  },
  lbAge: {
    background: "#e8906a", color: "#fff",
    fontSize: 13, fontWeight: 700,
    padding: "3px 12px", borderRadius: 12,
  },
  lbDate: { fontSize: 13, color: "#a07060" },
  lbName: { fontSize: 12, color: "#c09080", flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  lbNav: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 20px 16px",
  },
  lbNavBtn: {
    padding: "7px 16px", borderRadius: 16,
    border: "1.5px solid #e8906a", background: "transparent",
    color: "#e8906a", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  },
  lbNavBtnDisabled: {
    padding: "7px 16px", borderRadius: 16,
    border: "1.5px solid #e0d0c8", background: "transparent",
    color: "#d0c0b8", fontSize: 13, cursor: "default", fontFamily: "inherit",
  },
  lbCounter: { fontSize: 13, color: "#a07060" },

  // 모달
  modalOverlay: {
    position: "fixed", inset: 0, zIndex: 2000,
    background: "rgba(30,10,5,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "#fff9f5", borderRadius: 20,
    padding: "32px 28px", width: "min(88vw, 360px)",
    textAlign: "center",
  },
  modalTitle: {
    margin: "0 0 20px",
    fontSize: 20, color: "#3a2010",
  },
  pwInput: {
    width: "100%", boxSizing: "border-box",
    padding: "12px 16px", borderRadius: 10,
    border: "1.5px solid #f0d0c0", fontSize: 16,
    fontFamily: "inherit", outline: "none",
    background: "#fff",
  },
  pwInputError: {
    borderColor: "#e05040",
  },
  pwErrorMsg: {
    color: "#e05040", fontSize: 13, margin: "6px 0 0",
  },
  modalBtns: {
    display: "flex", gap: 10, marginTop: 20,
  },
  btnCancel: {
    flex: 1, padding: "10px", borderRadius: 10,
    border: "1.5px solid #e0d0c8", background: "transparent",
    color: "#a07060", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  },
  btnConfirm: {
    flex: 1, padding: "10px", borderRadius: 10,
    border: "none", background: "#e8906a",
    color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  empty: {
    textAlign: "center", padding: "80px 20px",
    color: "#c09080",
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
};
