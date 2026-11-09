# C-20 AI Vision Adapter

SDD 3.2.1. Wraps the AI vision API behind IVision (`vision.ts`): classify(photo) -> food type, category, quantity, calorie range, confidence, draft text in Arabic and English. The 10-second limit (BR-12) is applied by the Listing Service (`services/listing/aiDraft.ts`). Provider: SRS TBD-2, not chosen yet (D-80); `AI_VISION_MODE=mock` gives a fixed draft, anything else is "off" (manual entry, E-LST-01).
SRS: FR-LST-03, FR-LST-07, E-LST-01, NFR-02, NFR-03.
