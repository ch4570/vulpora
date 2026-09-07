package sample.docs;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

public final class RecordReader {
    /**
     * 목록을 처리한다.
     *
     * @param records 레코드
     * @return 첫 레코드
     */
    public <T> Optional<T> first(List<T> records) throws IOException {
        if (records == null) {
            throw new IOException("records are unavailable");
        }
        return records.stream().findFirst();
    }
}
