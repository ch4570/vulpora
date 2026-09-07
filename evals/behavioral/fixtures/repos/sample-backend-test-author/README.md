# sample-backend-test-author

일반 백엔드 테스트 작성 behavioral eval을 위한 합성 Python fixture다.

요구사항:

- `PricingService.total(unit_price, quantity)`는 수량이 1 이상이면 곱한 금액을 반환한다.
- 수량이 0 이하면 `ValueError("quantity must be positive")`를 발생시킨다.
- 테스트는 기존 `unittest` 관례를 따른다.
- `SessionCache`는 실제 Redis protocol 경계이며 client mock으로 의미를 대체하면 안 된다.
