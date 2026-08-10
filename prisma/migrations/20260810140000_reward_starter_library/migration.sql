-- Starter reward library + backfill.
--
-- Rule being installed: every merchant carries at least 5 curated reward
-- ideas, with every mechanic (stamp, discount, free item, time-limited)
-- represented. Each category set below is exactly 5 ideas covering all four
-- mechanics; the evergreen set (category NULL) is the fallback for merchants
-- whose category has no set of its own. Fixed rwt_* ids keep the insert
-- idempotent and let the backfill target exactly these rows.

INSERT INTO "RewardTemplate" (id, title, description, mechanic, category, archived, "createdAt", "updatedAt") VALUES
-- Evergreens: work for any business.
 ('rwt_any_stamp',    'Collect 10 stamps, get MVR 100 off',            'One stamp per visit. Ten visits earns MVR 100 off the next purchase.', 'STAMP_CARD',   NULL, false, now(), now()),
 ('rwt_any_disc',     '10% off your second visit this week',           'Come back within 7 days and take 10% off.',                            'DISCOUNT',     NULL, false, now(), now()),
 ('rwt_any_free',     'Free add-on with purchases over MVR 250',       'A small extra on us when the basket passes MVR 250.',                  'FREE_ITEM',    NULL, false, now(), now()),
 ('rwt_any_time',     'Double points every Friday',                    'All purchases earn double points on Fridays.',                         'TIME_LIMITED', NULL, false, now(), now()),
 ('rwt_any_bday',     'Birthday month: 20% off one purchase',          'Members get 20% off a single purchase during their birthday month.',   'DISCOUNT',     NULL, false, now(), now()),

-- Restaurants & Cafés
 ('rwt_cafe_stamp',   'Buy 5 coffees, get the 6th free',               'Collect a stamp per coffee. Six stamps, one on us.',                   'STAMP_CARD',   'Restaurants & Cafés', false, now(), now()),
 ('rwt_cafe_disc',    '10% off lunch before 12:30',                    'Beat the rush: early lunch orders get 10% off.',                       'DISCOUNT',     'Restaurants & Cafés', false, now(), now()),
 ('rwt_cafe_free',    'Free dessert with any two mains',               'Order two mains, pick any dessert on the house.',                      'FREE_ITEM',    'Restaurants & Cafés', false, now(), now()),
 ('rwt_cafe_time',    'Double stamps on weekday afternoons',           'Between 2 and 5pm, Sunday to Thursday, every coffee earns two stamps.','TIME_LIMITED', 'Restaurants & Cafés', false, now(), now()),
 ('rwt_cafe_group',   'Free sharing platter for tables of 4+',         'Bring the group: tables of four or more get a starter platter free.',  'FREE_ITEM',    'Restaurants & Cafés', false, now(), now()),

-- Retail & Shops
 ('rwt_shop_stamp',   'A stamp per MVR 100 — 10 stamps = MVR 150 off', 'Spend MVR 100, earn a stamp. Ten stamps takes MVR 150 off.',           'STAMP_CARD',   'Retail & Shops', false, now(), now()),
 ('rwt_shop_disc',    '15% off your next visit within 14 days',        'A reason to come straight back: 15% off within two weeks.',            'DISCOUNT',     'Retail & Shops', false, now(), now()),
 ('rwt_shop_free',    'Free gift wrap + accessory over MVR 500',       'Purchases over MVR 500 get gift wrapping and a small accessory free.', 'FREE_ITEM',    'Retail & Shops', false, now(), now()),
 ('rwt_shop_time',    'Weekend flash: double points Sat–Sun',          'Everything earns double points on weekends.',                          'TIME_LIMITED', 'Retail & Shops', false, now(), now()),
 ('rwt_shop_ref',     'Refer a friend: both get 10% off',              'When a friend makes their first purchase, you both get 10% off.',      'DISCOUNT',     'Retail & Shops', false, now(), now()),

-- Grocery & Supermarket
 ('rwt_groc_stamp',   'A stamp per MVR 200 basket — 10 = MVR 250 off', 'Baskets over MVR 200 earn a stamp. Ten stamps takes MVR 250 off.',     'STAMP_CARD',   'Grocery & Supermarket', false, now(), now()),
 ('rwt_groc_disc',    '5% off staples every Sunday',                   'Rice, flour, sugar and oil at 5% off to start the week.',              'DISCOUNT',     'Grocery & Supermarket', false, now(), now()),
 ('rwt_groc_free',    'Free pantry item on baskets over MVR 750',      'Pick a marked pantry item free when the basket passes MVR 750.',       'FREE_ITEM',    'Grocery & Supermarket', false, now(), now()),
 ('rwt_groc_time',    'Payday week: double points',                    'The last week of every month, all baskets earn double points.',        'TIME_LIMITED', 'Grocery & Supermarket', false, now(), now()),
 ('rwt_groc_bulk',    'MVR 100 off baskets over MVR 1,500',            'Stocking up pays: MVR 100 off large baskets.',                         'DISCOUNT',     'Grocery & Supermarket', false, now(), now()),

-- Hospitality & Resorts
 ('rwt_stay_stamp',   'Stay 5 nights across visits, 6th night free',   'Nights add up across stays. The sixth is on the house.',               'STAMP_CARD',   'Hospitality & Resorts', false, now(), now()),
 ('rwt_stay_disc',    '15% off spa for returning guests',              'Second stay onwards, spa treatments are 15% off.',                     'DISCOUNT',     'Hospitality & Resorts', false, now(), now()),
 ('rwt_stay_free',    'Complimentary sunset cruise on your 3rd stay',  'Loyalty gets a view: third stay includes a sunset cruise for two.',    'FREE_ITEM',    'Hospitality & Resorts', false, now(), now()),
 ('rwt_stay_time',    'Low-season double points (May–July)',           'Stays booked for the low season earn double points.',                  'TIME_LIMITED', 'Hospitality & Resorts', false, now(), now()),
 ('rwt_stay_direct',  'Free airport transfer on direct bookings',      'Book direct and the speedboat transfer is included.',                  'FREE_ITEM',    'Hospitality & Resorts', false, now(), now()),

-- Health & Beauty
 ('rwt_hb_stamp',     '5 visits, 6th treatment free',                  'A stamp per visit. The sixth treatment is free.',                      'STAMP_CARD',   'Health & Beauty', false, now(), now()),
 ('rwt_hb_disc',      '20% off a second service, same visit',          'Add a second service to the appointment and take 20% off it.',         'DISCOUNT',     'Health & Beauty', false, now(), now()),
 ('rwt_hb_free',      'Free conditioning add-on with any colour',      'Colour treatments include a deep-conditioning add-on free.',           'FREE_ITEM',    'Health & Beauty', false, now(), now()),
 ('rwt_hb_time',      'Midweek mornings: double points before noon',   'Tuesday to Thursday before 12pm, visits earn double points.',          'TIME_LIMITED', 'Health & Beauty', false, now(), now()),
 ('rwt_hb_friend',    'Bring a friend: both get 15% off',              'Book together and you each take 15% off.',                             'DISCOUNT',     'Health & Beauty', false, now(), now()),

-- Fashion & Apparel
 ('rwt_fash_stamp',   'A stamp per MVR 250 — 8 stamps = MVR 300 off',  'Spend MVR 250, earn a stamp. Eight stamps takes MVR 300 off.',         'STAMP_CARD',   'Fashion & Apparel', false, now(), now()),
 ('rwt_fash_disc',    '10% off when you return within 30 days',        'Come back within a month and take 10% off.',                           'DISCOUNT',     'Fashion & Apparel', false, now(), now()),
 ('rwt_fash_free',    'Free alteration with any purchase',             'Hemming and small alterations included with every purchase.',          'FREE_ITEM',    'Fashion & Apparel', false, now(), now()),
 ('rwt_fash_time',    'New collection week: double points',            'Launch weeks earn double points on the new collection.',               'TIME_LIMITED', 'Fashion & Apparel', false, now(), now()),
 ('rwt_fash_member',  'End-of-season: extra 5% for members',           'Members stack an extra 5% on end-of-season prices.',                   'DISCOUNT',     'Fashion & Apparel', false, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Backfill: every merchant gets its category's 5-idea set, or the evergreen
-- set when its category has no set. NOT EXISTS keeps this idempotent and
-- skips ideas a rep already curated from the same template.
INSERT INTO "CuratedReward"
    (id, "merchantId", "templateId", title, description, mechanic, status, "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, m.id, t.id, t.title, t.description, t.mechanic,
       'IDEA', m."ownerId", now(), now()
FROM "Merchant" m
JOIN "RewardTemplate" t
  ON t.id LIKE 'rwt\_%'
 AND t.archived = false
 AND t.category IS NOT DISTINCT FROM (
       CASE WHEN EXISTS (
              SELECT 1 FROM "RewardTemplate" x
              WHERE x.id LIKE 'rwt\_%' AND x.category = m.category AND x.archived = false
            )
            THEN m.category ELSE NULL END)
WHERE NOT EXISTS (
  SELECT 1 FROM "CuratedReward" c
  WHERE c."merchantId" = m.id AND c."templateId" = t.id
);
