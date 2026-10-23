import { spawnSync } from "node:child_process";
// Deliberately restricted to the local Docker stack; no remote database URL.
const buddyId = process.argv[2] ?? "11f596ac-19ef-4de0-98a6-19dfb2c42fd3";
if (!/^[0-9a-f-]{36}$/i.test(buddyId))
  throw new Error("Pass a Buddy account UUID.");
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function sql(input: string) {
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
const host = JSON.parse(
  sql(
    `SELECT coalesce((SELECT json_build_object('id',id,'uid',supabase_user_id,'name',data->>'displayName') FROM travelbuddy_backend.accounts WHERE id=${q(buddyId)}::uuid AND supabase_user_id IS NOT NULL AND data->>'status'='active' AND data->>'onboarding'='completed' AND data->'roles' ?| ARRAY['provider','guide']),'null')`,
  ),
) as { id: string; uid: string; name: string } | null;
if (!host)
  throw new Error(
    "An existing active, completed Buddy/Guide with a real Auth identity is required.",
  );
const travelers = JSON.parse(
  sql(
    `SELECT coalesce(json_agg(row_to_json(a)),'[]') FROM (SELECT id,supabase_user_id AS uid,data->>'displayName' AS name FROM travelbuddy_backend.accounts WHERE supabase_user_id IS NOT NULL AND data->>'status'='active' AND data->>'onboarding'='completed' AND data->'roles' ? 'traveler' ORDER BY created_at,id LIMIT 2) a`,
  ),
) as { id: string; uid: string; name: string }[];
if (travelers.length < 2)
  throw new Error("Two existing completed Traveller accounts are required.");
const examples = [
  {
    slug: "ella-tea",
    town: "Ella",
    title: "Ella tea trails and village breakfast",
    point: "Ella railway station entrance",
    lat: 6.8753,
    lng: 81.0463,
    price: 9300,
    time: "07:00",
    description:
      "An easy morning walk through tea country, followed by a Sri Lankan village breakfast.",
    category: "Tours & sightseeing",
    question: "We are two travellers. Is the tea walk suitable for beginners?",
    reply:
      "Yes. We take a relaxed route with plenty of breaks. Please bring walking shoes and water.",
    follow: "Lovely! Can we meet at Ella railway station?",
    answer:
      "Yes, at the station entrance at 7 am. Check the available date before booking.",
  },
  {
    slug: "ella-nine-arches",
    town: "Ella",
    title: "Nine Arch Bridge and a local tea stop",
    point: "Ella railway station entrance",
    lat: 6.8753,
    lng: 81.0463,
    price: 8000,
    time: "09:00",
    description:
      "Explore Ella’s green hills, hear railway stories and pause for a cup of local tea.",
    category: "Tours & sightseeing",
  },
  {
    slug: "colombo-food",
    town: "Colombo",
    title: "Colombo street food with a local buddy",
    point: "Galle Face Green, near the Galle Face Hotel entrance",
    lat: 6.9203,
    lng: 79.8449,
    price: 10600,
    time: "17:00",
    description:
      "Discover local snacks and everyday food stories on an easy evening walk.",
    category: "Food & drink",
    question: "Do you have vegetarian choices on the food walk?",
    reply:
      "Yes, we can choose vegetarian hoppers, roti and fresh fruit. Let me know any allergies before booking.",
    follow: "One of us avoids peanuts. Is that possible?",
    answer:
      "Thanks for telling me. We can discuss suitable stops, but shared kitchens may have cross-contact. Please check with each vendor too.",
  },
  {
    slug: "colombo-sunset",
    town: "Colombo",
    title: "Galle Face sunset and city stories",
    point: "Galle Face Green, near the Galle Face Hotel entrance",
    lat: 6.9203,
    lng: 79.8449,
    price: 6000,
    time: "16:30",
    description:
      "A relaxed seafront stroll with local stories and time to enjoy the sunset.",
    category: "Cultural experiences",
  },
  {
    slug: "galle-fort",
    town: "Galle",
    title: "Galle Fort lanes and coastal stories",
    point: "Galle Fort clock tower",
    lat: 6.0309,
    lng: 80.2151,
    price: 8600,
    time: "08:30",
    description:
      "Walk the fort’s lanes and ramparts, discover coastal stories and stop for tea.",
    category: "Cultural experiences",
    question: "How much walking is there on the fort tour?",
    reply:
      "About two hours at an easy pace. There are uneven stones and steps, and we can take breaks.",
    follow: "Could we start in the morning to avoid the midday heat?",
    answer:
      "Yes. The morning option starts at 8:30 near the clock tower. Please select an available date in checkout.",
  },
  {
    slug: "kandy-lake",
    town: "Kandy",
    title: "Kandy lake walk and market flavours",
    point: "Kandy Lake, Queen’s Hotel side",
    lat: 7.2931,
    lng: 80.6403,
    price: 7300,
    time: "09:00",
    description:
      "Meet by the lake for city stories, a market visit and a taste of everyday Kandy.",
    category: "Food & drink",
    question: "We arrive by train. Where should we meet for the lake walk?",
    reply:
      "Meet on the Queen’s Hotel side of Kandy Lake. The meeting pin on the experience page shows the point.",
    follow: "Does the price include a snack?",
    answer:
      "Yes, one local snack and tea are included. Extra purchases and transport are separate.",
  },
];
const claims = (uid: string) =>
  `SELECT set_config('request.jwt.claims',${q(JSON.stringify({ sub: uid, role: "authenticated" }))},true);`;
let transaction = "BEGIN;\n";
for (const [index, e] of examples.entries()) {
  const id = "demo-sl-" + e.slug;
  // Reuse a catalog photo only when it belongs to the same destination.
  const photo = sql(
    `SELECT coalesce((SELECT data->>'image' FROM travelbuddy_backend.packages WHERE destination=${q(e.town)} AND id NOT LIKE 'demo-sl-%' ORDER BY id LIMIT 1),'/brand/app-icon.svg')`,
  );
  const data = {
    id,
    title: `[Demo] ${e.title}`,
    destination: e.town,
    country: "Sri Lanka",
    category: e.category,
    image: photo,
    gallery: [photo],
    currency: "LKR",
    price: e.price,
    rating: 0,
    reviews: 0,
    duration: "2 hours",
    freeCancellation: true,
    description: `Local development example. ${e.description}`,
    supplier: host.name,
    languages: ["English", "Sinhala"],
    highlights: ["Local stories", "Small group", "Relaxed pace"],
    included: ["Buddy-led walk", "Tea and one local snack"],
    notIncluded: ["Transport", "Additional purchases"],
    meetingPoint: e.point,
    options: [
      {
        name: "Small group walk",
        price: e.price,
        duration: "2 hours",
        detail: "Up to 6 guests",
        times: [e.time],
        capacity: 6,
      },
    ],
    itinerary: [
      { time: e.time, title: "Meet your buddy", detail: e.point },
      {
        time: "During the walk",
        title: "Explore together",
        detail: e.description,
      },
    ],
  };
  transaction += `DO $$BEGIN IF EXISTS(SELECT 1 FROM travelbuddy_backend.packages WHERE id=${q(id)} AND owner_id IS DISTINCT FROM ${q(host.id)}::uuid) THEN RAISE EXCEPTION 'Demo package already belongs to another Buddy'; END IF; END $$;
 INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at) VALUES(${q(id)},${q(host.id)}::uuid,${q(data.title)},${q(e.town)},'Sri Lanka',${q(e.category)},${e.price},0,120,'2 hours',true,true,${q(JSON.stringify(data))}::jsonb,'{}'::jsonb,clock_timestamp()) ON CONFLICT(id) DO NOTHING;
 ${claims(host.uid)} SET LOCAL ROLE authenticated;
 SELECT travelbuddy_api.save_meeting_point(${q(JSON.stringify({ packageId: id, area: e.town, label: e.point, latitude: e.lat, longitude: e.lng }))}::jsonb);RESET ROLE;
 `;
  if (e.question) {
    const traveler = travelers[index % travelers.length];
    transaction += `DO $demo$ DECLARE conversation uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.conversations WHERE package_id=${q(id)} AND ${q(traveler.id)}::uuid IN(participant_one_id,participant_two_id)) THEN
 PERFORM set_config('request.jwt.claims',${q(JSON.stringify({ sub: traveler.uid, role: "authenticated" }))},true);
 conversation:=travelbuddy_api.start_chat(${q(id)});
 PERFORM travelbuddy_api.send_message(conversation,${q("[Demo conversation] " + e.question)});
 PERFORM set_config('request.jwt.claims',${q(JSON.stringify({ sub: host.uid, role: "authenticated" }))},true);
 PERFORM travelbuddy_api.send_message(conversation,${q(e.reply!)});
 PERFORM set_config('request.jwt.claims',${q(JSON.stringify({ sub: traveler.uid, role: "authenticated" }))},true);
 PERFORM travelbuddy_api.send_message(conversation,${q(e.follow!)});
 PERFORM set_config('request.jwt.claims',${q(JSON.stringify({ sub: host.uid, role: "authenticated" }))},true);
 PERFORM travelbuddy_api.send_message(conversation,${q(e.answer!)});
 END IF;
 -- send_message uses transaction timestamps. Give demo lines distinct times so
 -- a single seed transaction preserves their intended conversational order.
 SELECT c.id INTO conversation FROM travelbuddy_backend.conversations c
 WHERE c.package_id=${q(id)} AND ${q(traveler.id)}::uuid IN(c.participant_one_id,c.participant_two_id);
 IF (SELECT count(*) FROM travelbuddy_backend.messages WHERE conversation_id=conversation)=4
 AND EXISTS(SELECT 1 FROM travelbuddy_backend.messages WHERE conversation_id=conversation AND body=${q("[Demo conversation] " + e.question)}) THEN
 UPDATE travelbuddy_backend.messages SET created_at=(SELECT created_at FROM travelbuddy_backend.conversations WHERE id=conversation)+
 make_interval(secs=>array_position(ARRAY[${["[Demo conversation] " + e.question, e.reply!, e.follow!, e.answer!].map(q).join(",")}],body))
 WHERE conversation_id=conversation AND body=ANY(ARRAY[${["[Demo conversation] " + e.question, e.reply!, e.follow!, e.answer!].map(q).join(",")}]);
 END IF;
 END $demo$;
 `;
  }
}
transaction += "COMMIT;";
sql(transaction);
console.log(
  `Seeded 6 labelled demo experiences for ${host.name} in Ella, Colombo, Galle and Kandy, plus 4 conversations with ${travelers.map((t) => t.name).join(" and ")}. Re-running does not duplicate them.`,
);
console.log(
  "Open the Buddy account, enable Accepting requests, and keep its app tab open to appear in Nearby. No reservations were created.",
);
