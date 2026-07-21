# ADR-002: Admission acceptance uses an idempotent review-and-create transaction

Status: Accepted — 2026-07-22

Accepting an application opens a prefilled review step for account, guardian, and enrollment
details. Confirmation creates and links the Student, Guardian, enrollment, immutable admission
snapshot, and administrative notification atomically. Retrying returns the same conversion;
reversing application status preserves created People records.
