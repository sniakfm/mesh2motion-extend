<p align="right">
  🌐 <a href="./README.md">English</a> | <b>한국어 (Korean)</b>
</p>

<img src="./mesh2motion.svg" alt="Mesh2Motion Logo" width="400"/>

> [!NOTE]
> ### 📢 커스텀 포크 안내
> - **권리 안내**: 원본이 된 프로그램의 모든 권리는 [Mesh2Motion 개발팀](https://github.com/Mesh2Motion)에 있으며, 본 프로젝트는 Gemini 3.8 모델을 활용하여 코드를 일부 수정한 포크입니다.
> - **목적**: [Motion2MixamoRig](https://github.com/MaxLiu22/Motion2MixamoRig)에서 export된 GLB 파일을 Mesh2Motion에 손쉽게 이식하고 관리하기 위해 만든 포크입니다.
> - **지원 안내**: 이 프로그램이 마음에 드신다면, 아래 원본 프로젝트 개발팀들을 지원해주세요!
>   - Mesh2Motion: https://github.com/Mesh2Motion
>   - Motion2MixamoRig: https://github.com/MaxLiu22/Motion2MixamoRig

---

### ✨ 주요 추가 기능 및 개선 사항

1. **4단계 탭 필터링 (`All`, `Library`, `Imported`, `Selected`)**
   - 애니메이션 목록을 4가지 탭으로 나누어 효율적으로 탐색할 수 있습니다.
   - 검색창 입력 시에도 현재 선택된 탭(예: Imported 탭에서는 내가 불러온 애니메이션만 검색) 내에서 필터링이 유지됩니다.

2. **우클릭 컨텍스트 메뉴 (이름 변경 / 삭제)**
   - 불러온 애니메이션 카드를 마우스 우클릭하여 메뉴를 호출할 수 있습니다.
   - **Change Name**: 고정된 클립명을 원하는 이름으로 변경하며, Three.js 씬 및 브라우저 IndexedDB에 영구 저장됩니다.
   - **Delete**: 애니메이션을 목록에서 즉시 제거하며, 다이얼로그에서 *"폴더 내 원본 파일도 함께 삭제"*를 선택할 경우 Tauri를 통해 로컬 파일까지 함께 삭제됩니다.

3. **Mixamo 클립명 자동 정리**
   - Mixamo FBX/GLB를 임포트할 때 무조건 `mixamo.com`으로 뜨던 클립 이름을 파일명(확장자 제외)으로 자동 변환해 줍니다.

4. **Motion2MixamoRig 변환 브릿지 도구 포함**
   - `convert_mixamo_to_mesh2motion.py` 및 `.bat` 스크립트를 통해 Motion2MixamoRig에서 내보낸 본 구조를 Mesh2Motion용 애니메이션으로 자동 변환할 수 있습니다.

5. **Tauri 데스크톱 원클릭 빌드 도구**
   - `build_desktop.bat` 실행 시 데스크톱 앱을 컴파일하고, `dist_desktop/` 폴더에 실행 파일 및 유틸리티 스크립트를 자동 패키징합니다.

---

### 🚀 사용법 및 빌드

#### 1. 웹 개발 모드 실행
```bash
npm install
npm run dev
```

#### 2. 데스크톱 앱 빌드 (Tauri)
```bash
build_desktop.bat
```
빌드가 완료되면 `dist_desktop/` 디렉토리에 `mesh2motion.exe` 및 변환 스크립트가 함께 생성됩니다.

---

### 📄 라이선스
- 코드 및 플랫폼: **MIT License** ([LICENSE-MIT.MD](./LICENSE-MIT.MD))
- 3D 모델, 본, 애니메이션 에셋: **CC0 1.0 Universal** ([LICENSE-CC0.MD](./LICENSE-CC0.MD))
