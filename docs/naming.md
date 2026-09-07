# Vulpora · 벌포라

[English README](../README.md) · [한국어 README](../README.ko.md) · [Documentation](README.md)

**Vulpora** is the project name.
The name combines the fox association of *vulpes* with the idea of a gathering place, *agora*:
specialists meet around a shared task. It is a coined project name, not the name of a traditional mythical creature.

한국어 표기는 **벌포라**입니다. 여우를 떠올리는 이름에 여러 전문가가 한곳에 모인다는 뜻을 담았습니다.
상징은 여러 꼬리를 펼친 상상의 여우입니다. 각각의 꼬리는 코드, 설계, 데이터, 테스트, 문서처럼
서로 다른 전문성을 나타내며, 하나의 몸은 공동의 작업 목적을 나타냅니다.

**Tagline:** Specialists in sync.

**한국어 소개:** 여러 전문성을 하나의 작업으로.

## Visual identity

![Vulpora fox banner](assets/vulpora-hero.png)

The ivory fox and its flowing tails form the primary mark. Amber lines connect the figure to a
constellation: distinct roles with explicit connections. The banner is shared by both README languages.

| Element | Direction |
|---|---|
| Primary wordmark | `VULPORA`; use `Vulpora` in prose |
| npm package and public command | `vulpora` |
| Base palette | Dark charcoal `#111820`, warm ivory `#F2E7D3`, amber `#DDA65D` |
| Mascot | An original, imagined fox with many flowing tails |
| Artwork | [README banner](assets/vulpora-hero.png), generated with the built-in image tool |
| Reproduction notes | [Asset source and prompts](assets/README.md) |

The palette describes the design direction; individual pixels in the generated illustration vary.

## Project identifiers

V1 uses one namespace across the distribution and runtime assets.

| Surface | Identity |
|---|---|
| Project | Vulpora · 벌포라 |
| Package and executable | `vulpora` |
| Repository | `ch4570/vulpora` |
| Bootstrap skills | `vulpora-init`, `vulpora-installer` |
| Environment variables | `VULPORA_*` |
| Project policy | `vulpora.config.json` |
| Local state | `.vulpora/` |
| Schemas and receipt identifiers | `vulpora.*` |
| Claude marketplace/plugin | `vulpora@vulpora` |

The first public release is v1.0.0. Configuration and receipts must use these identifiers; there is no
second executable alias or alternate namespace. Review existing project configuration before reinstalling
assets from an earlier development snapshot. Manual files remain protected by installer ownership checks.

## Distribution

See [installation](../INSTALL.md) for the public Git launcher and npm publication status.
The banner was generated with the built-in image tool; its [prompt and asset notes](assets/README.md)
are included with the source.
