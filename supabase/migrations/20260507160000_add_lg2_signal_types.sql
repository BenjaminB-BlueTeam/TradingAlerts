-- Ajoute les signal_types LG2 (LG2_A, LG2_B, LG2_A+B) à la contrainte CHECK de alerts
-- La contrainte existante alerts_signal_type_check ne couvrait pas LG2, causant des erreurs 23514

ALTER TABLE public.alerts
  DROP CONSTRAINT alerts_signal_type_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_signal_type_check
    CHECK (signal_type = ANY (ARRAY[
      'FHG'::text,
      'FHG_DOM'::text,
      'FHG_EXT'::text,
      'FHG_A'::text,
      'FHG_B'::text,
      'FHG_A+B'::text,
      'FHG_C'::text,
      'FHG_D'::text,
      'DC'::text,
      'LG2_A'::text,
      'LG2_B'::text,
      'LG2_A+B'::text
    ]));
