# Pokémon Champions Data

Pokémon Champions Stat Lab의 웹과 Android 앱이 함께 읽는 데이터 전용 저장소입니다.
화면 코드, 계산 코드, Android 프로젝트와 아이콘은 이 저장소에 넣지 않습니다.

## 처음 만들 때

1. 이 폴더 내용만 새 GitHub 저장소 `pokemon-champions-data`에 올립니다.
2. GitHub의 **Actions** 탭에서 `Update Pokémon data`를 선택합니다.
3. **Run workflow**를 눌러 데이터 파일을 한 번 생성합니다.
4. 앱 저장소의 `www/js/config.js`에 이 저장소의 Raw 주소를 입력합니다.

```js
dataBaseUrl: 'https://raw.githubusercontent.com/GITHUB_ID/pokemon-champions-data/main'
```

## 자동 업데이트

GitHub Actions가 매일 한국시간 오전 3시 17분경 원본 자료를 확인합니다. 내용이
달라지면 `data` 파일과 `manifest.json`이 함께 갱신됩니다. 앱은 실행할 때
`manifest.json`의 버전을 비교하고 새 데이터만 휴대폰 캐시에 저장합니다.

v19.4부터 다음 선택 보조 데이터도 함께 갱신합니다.

- `data/champions-learnsets.json`: Champions 포켓몬별 습득 가능 기술
- `data/showdown-abilities.json`: 특성 이름과 효과 설명
- `data/move-flavor-ko.json`: 기술 한국어 효과 설명
- `data/ability-flavor-ko.json`: 특성 한국어 효과 설명

`data/champions-mc.json`은 Regulation M-C 전용 보정 자료입니다. 신규 포켓몬,
신규 메가폼, 신규 도구와 최신 특성이 들어 있으며 자동 갱신을 실행해도 지워지지
않습니다. 새 규정 자료를 수동으로 고친 뒤 `npm run update`를 실행하면 해시와
데이터 버전이 새 `manifest.json`에 기록됩니다.

직접 갱신하려면 Actions에서 `Run workflow`를 누르거나 컴퓨터에서 다음을 실행합니다.

```bash
npm run update
npm run check
```

## 출처

- Pokémon Showdown 데이터
- Pokémon Showdown Champions 모드 데이터
- PokéAPI CSV 데이터
- Pokémon Champions Regulation M-C 공식 발표 및 최신 배틀 데이터 대조 자료
- 한국어 이름 보조 자료

각 원본 프로젝트의 라이선스와 이용 조건을 확인하고 출처 표기를 유지해야 합니다.
