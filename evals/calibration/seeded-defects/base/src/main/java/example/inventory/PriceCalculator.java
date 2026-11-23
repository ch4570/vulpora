package example.inventory;

import java.math.BigDecimal;
import java.math.RoundingMode;

public class PriceCalculator {
    public BigDecimal total(BigDecimal unitPrice, int quantity) {
        return unitPrice.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
    }
}
