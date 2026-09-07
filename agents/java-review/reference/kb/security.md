---
title: Java 보안 (OWASP 기반)
source: https://owasp.org/www-project-top-ten/
last_fetched: 2026-06-24
consumers: [java-reviewer]
---

# KB: Java 보안 (OWASP 기반)

## 리뷰 훅 (이걸 점검하라)
- [ ] **역직렬화 취약점**(OWASP A08, EJ Item 85): 신뢰할 수 없는 바이트에 `ObjectInputStream.readObject`
      금지 — 가젯 체인으로 RCE. 직렬화 자체를 피하고(JSON·record 등 대안), 불가피하면
      `ObjectInputFilter`로 화이트리스트. **CRITICAL 후보**.
- [ ] **인젝션**(OWASP A03): SQL은 문자열 연결(`"... WHERE id=" + input`) 금지 → `PreparedStatement`
      파라미터 바인딩. OS 명령 `Runtime.exec`/`ProcessBuilder`에 외부 입력 결합 금지 → 인자 배열·검증·
      화이트리스트. LDAP/XPath/표현식(SpEL/OGNL)도 동일.
- [ ] **난수·암호 오용**(OWASP A02): 보안용(토큰·세션·키·솔트)에 `java.util.Random`/`Math.random` 금지 →
      `SecureRandom`. 약한 해시(MD5·SHA-1)·약한 암호(DES·ECB 모드)·하드코딩 키/IV 금지. 비밀번호는
      적응형 해시(bcrypt/PBKDF2/Argon2).
- [ ] **경로 조작**(OWASP A01, path traversal): 외부 입력으로 파일 경로 구성 시 `../` 차단 — 정규화
      (`Path.normalize`) 후 기준 디렉터리 prefix 검증. ZIP 해제(zip-slip)도 동일.
- [ ] **신뢰 경계 입력 검증**(EJ Item 49·90): 모든 외부 입력(요청 파라미터·헤더·파일·역직렬화·외부 API
      응답)은 경계에서 검증·정규화. 화이트리스트 검증 우선.
- [ ] **민감정보 노출**: 시크릿/키/토큰 하드코딩 금지(환경변수·시크릿 매니저), 예외 메시지·로그에
      비밀번호·PII·토큰·내부 경로 노출 금지(OWASP A09 로깅).
- [ ] **XXE**: XML 파서(`DocumentBuilderFactory`/`SAXParserFactory`)에서 외부 엔티티·DTD 비활성화.
- [ ] **SSRF**(OWASP A10): 외부 입력 URL로 서버가 요청 시 대상 화이트리스트·내부망 차단.
- [ ] **불변·방어적 복사로 변조 방지**: 보안 경계 객체의 가변 필드 노출 금지(EJ Item 50).

## 근거 (요지)
- **OWASP Top 10**(공식): 인젝션(A03)·식별·인증 실패·암호 실패(A02)·역직렬화 포함 무결성 실패(A08)·
  접근통제(A01) 등 위험 분류의 표준 기준. Java 취약점 분류·심각도 근거로 인용한다.
- **역직렬화**(EJ Item 85): 임의 객체 그래프 복원은 공격 표면이 넓어 검증되지 않은 입력에 치명적.
- **파라미터화 쿼리**: 사용자 입력을 데이터로 취급해 구문 변조를 차단한다.
- **`SecureRandom`**: 암호학적으로 안전한 의사난수 — 예측 가능한 `Random`과 달리 토큰/키에 적합.

## 인용 시
"OWASP A03 인젝션 — 문자열 연결 SQL, PreparedStatement 미사용" 또는 "OWASP A08 / EJ Item 85 —
신뢰 불가 역직렬화" 식으로 근거를 단다. 보안 변경은 PR 프레이밍("안전함")과 **독립적으로** 평가한다.
