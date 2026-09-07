---
title: MapStruct 기본 (컴파일타임 매퍼 생성)
source: https://mapstruct.org/documentation/stable/reference/html/
last_fetched: 2026-06-24
skills: [mapper]
---

# MapStruct 기본

> 이 프로젝트는 불변 모델 때문에 수동 매퍼를 쓰지만, MapStruct는 가변 모델 프로젝트에서 정당한 선택이다.
> 공정한 비교를 위해 핵심을 정리한다.

## 개념
MapStruct는 **컴파일타임 애너테이션 프로세서**다. 인터페이스에 `@Mapper`를 붙이면 빌드 시 구현체를
코드 생성한다. 리플렉션이 없어 런타임 오버헤드가 작고, 타입 불일치를 컴파일 시점에 잡는다.

```java
@Mapper(componentModel = "spring")
public interface OrderMapper {
    OrderModel toModel(OrderEntity entity);
    OrderEntity toEntity(OrderModel model);
}
```

## componentModel
- `default`: 정적 팩토리(`Mappers.getMapper(...)`)로 인스턴스를 얻는다.
- `spring`: 생성 클래스에 `@Component`가 붙어 Spring 빈으로 주입된다.

## 자동 매핑과 @Mapping
- **이름 기반 자동매핑**: 같은 이름·호환 타입 필드는 자동으로 매핑된다.
- 이름이 다르면 `@Mapping(source = "...", target = "...")`로 명시한다. 여러 개는 `@Mappings`로 묶는다.

```java
@Mapping(source = "memberId", target = "member.id")
OrderModel toModel(OrderEntity entity);
```

## null 전략
- `NullValueMappingStrategy`: 소스 객체 전체가 null일 때의 결과(예: 빈 컬렉션 반환).
- `NullValuePropertyMappingStrategy`: 개별 프로퍼티가 null일 때 타깃을 어떻게 둘지(무시/기본값 등).
- `@BeanMapping`으로 메서드 단위 전략을 지정한다.

## 빌더/생성자 매핑
MapStruct는 setter뿐 아니라 **빌더**와 **생성자** 기반 타깃 생성도 지원한다. 따라서 불변 객체도 빌더가
있으면 매핑할 수 있다.

## Kotlin에서의 한계
- 애너테이션 프로세싱이 필요하므로 **kapt** 또는 **KSP** 설정이 따른다.
- 불변 `val` data class는 setter가 없어 **생성자/빌더 경로**에 의존한다. 자동 추론이 항상 깔끔하지 않을 수
  있어, 결국 `@Mapping`을 다수 명시해야 하는 경우 수동 매퍼 대비 이점이 줄어든다.
- 이 프로젝트는 이 한계를 이유로 수동 매퍼를 택했다.

## 리뷰 훅
- [ ] (MapStruct 사용 시) `componentModel`이 프로젝트 DI 방식과 맞는가?
- [ ] 이름 불일치 필드에 `@Mapping`을 명시했는가?
- [ ] null 전략(`NullValue*MappingStrategy`)을 의도대로 설정했는가?
- [ ] 불변 타깃이면 빌더/생성자 매핑 경로가 동작하는가?
- [ ] Kotlin이면 kapt/KSP가 설정돼 코드가 생성되는가?
- [ ] (이 프로젝트) 수동 매퍼 규약을 어기고 MapStruct를 재도입하지 않았는가?
