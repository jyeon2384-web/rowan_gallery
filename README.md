# 👶 우리 아가의 성장일기

Google Drive 연동 가족 전용 사진·영상 갤러리

## 설정 방법

### 1. `src/App.jsx` 상단 설정값 수정

```js
const BABY_NAME = "우리 아가";           // 아기 이름으로 변경
const BABY_BIRTHDATE = new Date("2026-03-11"); // 생년월일
const ADMIN_PASSWORD = "baby2026";       // 원하는 비밀번호로 변경

const GDRIVE_CONFIG = {
  apiKey: "YOUR_API_KEY",       // Google API 키
  clientId: "YOUR_CLIENT_ID",   // OAuth 클라이언트 ID
  folderId: "YOUR_FOLDER_ID",   // Drive 폴더 ID
  scope: "https://www.googleapis.com/auth/drive.file",
};
```

### 2. `vite.config.js` base 경로 확인

```js
base: '/baby-gallery/',  // GitHub 저장소 이름과 동일하게
```

### 3. GitHub Pages 활성화

저장소 Settings → Pages → Source: **GitHub Actions** 선택

그 후 main 브랜치에 push하면 자동 배포됩니다.

## 접속 URL

```
https://[GitHub유저명].github.io/baby-gallery/
```

## 기능

- 🔒 관리자 비번 입력 후 사진·영상 다중 업로드
- 📅 생후 개월수 자동 계산 및 그룹 표시
- 📷 사진 / 🎬 영상 탭 구분
- 🖥️ 아이패드·스마트TV 반응형
- 🔍 라이트박스 (키보드 ← → 이동)
