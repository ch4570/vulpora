class PricingService:
    def total(self, unit_price: int, quantity: int) -> int:
        if quantity <= 0:
            raise ValueError("quantity must be positive")
        return unit_price * quantity
