-- ============================================================
-- Migration 025: Strip Greek "Δ" room-identifier prefix
-- ============================================================
-- Listing descriptions reference rooms as "Room Δ1A", "Room Δ2",
-- etc. The Greek capital delta is meaningful to a Greek reader
-- (it's an abbreviation for "diamerisma" / διαμέρισμα — apartment)
-- but reads as garbage to international students browsing the
-- English locale. Descriptions aren't currently localised, so the
-- same string serves both audiences.
--
-- Strip the Δ prefix from room identifiers. Greek readers still
-- parse "Room 1A" naturally; English readers no longer see a
-- mystery glyph. Confirmed against 0100001–0100006 — only
-- room-identifier Δ's are present.

UPDATE listings
   SET description = REGEXP_REPLACE(description, 'Δ(\d+[A-Za-z]?)', '\1', 'g')
 WHERE description LIKE '%Δ%';

-- ---- Reversal -------------------------------------------------------
-- No automated reversal; the Δ prefixes were synthetic seed data and
-- the transformation isn't lossy in any meaningful way (the room
-- identifiers — '1A', '1B', '2', '3', etc. — are unchanged).
