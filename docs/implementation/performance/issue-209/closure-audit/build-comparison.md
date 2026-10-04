# Ordinary production build and resource comparison

Ordinary pristine baseline `26f46fb5398c7eb769fe1bffa5ed60f80f20eea5` from the unchanged archived Phase A production inventory; ordinary candidate `039534f1bba205d67938f987d2bd085d01c8f263` built before the diagnostic timing builds. Compressed columns are reproducible offline gzip/Brotli estimates. They are not hosted response transfer sizes. Bundled gameplay/catalog data has no separate network chunk and is included in application JS.

| Payload | Baseline raw / gzip / Brotli bytes | Candidate raw / gzip / Brotli bytes |
| --- | --- | --- |
| Application JS | 792,987 / 178,679 / 145,656 | 821,509 / 185,683 / 151,512 |
| Phaser | 1,208,050 / 330,419 / 264,694 | 1,208,050 / 330,419 / 264,694 |
| CSS | 1,273 / 587 / 458 | 1,273 / 587 / 458 |
| Whole packaged dist | 10,411,457 / 8,485,657 / 8,377,044 | 10,439,979 / 8,492,663 / 8,382,906 |

| Identity / boot closure | Baseline | Candidate |
| --- | ---: | ---: |
| Logical art bindings | 619 | 619 |
| Physical visual resources / texture keys | 96 | 96 |
| Unique physical visual asset URLs | 112 | 112 |
| Packaged files | 226 | 226 |
| Boot visual physical resources / image+JSON files | 6 / 10 | 6 / 10 |
| Boot visuals raw bytes | 931,073 | 931,073 |
| Boot audio files / raw bytes | 21 / 181,084 | 4 / 68,976 |
| Boot Phaser entries: visual + audio | 27 | 10 |
| Boot asset files excluding JS/CSS/font/lazy Home resources | 31 | 14 |
| Deferred run-only audio files / raw bytes | 0 / 0 | 17 / 112,108 |
| Four Nunito weights / unique WOFF2 resources / raw bytes | 4 / 1 / 39,152 | 4 / 1 / 39,152 |
| Entire packaged audio payload files / raw bytes | 21 / 181,084 | 21 / 181,084 |

The four menu files are navigate/confirm/back plus Menu music. The 17-file run-common closure is prepared before GameScene, remains optional/silent on failure, and uses the existing game-scoped AudioManager. Boot does not require ordinary enemy/projectile/drop/weapon/run-only art just because it exists. The shared boot actor/chrome resources serve menu presentation and remain deliberate core assets. No codec change is justified by this small measured WAV payload; package size has not been falsely reduced by merely deferring downloads.

The application grows 28,522 raw / 7,004 gzip / 5,856 Brotli bytes from original main (3.6% raw), including the intervening observability/resource/ownership/platform-documentation and adjacent actor/camera/HUD work. The closure fix itself adds 864 raw / 257 gzip / 201 Brotli bytes from starting main. Phaser and CSS are byte-identical. There is no measured reason to introduce more code splitting.

Cold usable Home includes initial lazy portraits/backdrop as well as Boot. Observed request counts from diagnostic captures below include JS, CSS and font. They must not be confused with the curated Boot closure or the 226 packaged files.

| Cold Home observed asset URLs / audio URLs | Baseline | Candidate |
| --- | --- | --- |
| desktop-1280x720 | [40, 40, 40] / [21, 21, 21] | [23, 23, 23] / [4, 4, 4] |
| phone-390x844-dpr3 | [40, 40, 40] / [21, 21, 21] | [23, 23, 23] / [4, 4, 4] |
| foldable-1114x720-dpr2 | [40, 40, 40] / [21, 21, 21] | [23, 23, 23] / [4, 4, 4] |

The retained full inventory includes panel-specific closures, run-common/content-specific closures, individual URLs/sizes/hashes, logical-versus-physical identity, audio duration/format, build metadata and source hashes. Asset counts and payloads are reproducible facts; wall-clock parse/renderer/GPU cost is not isolated by the inventory.
