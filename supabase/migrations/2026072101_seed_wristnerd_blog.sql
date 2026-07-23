-- Seed four starter blog posts for the WristNerd (watch-tools) tenant.
-- These posts are editable from the dashboard content manager.
-- If a site row for 'watch-tools' does not exist, the inserts are skipped.

DO $$
DECLARE
  watch_tools_id uuid := (SELECT id FROM sites WHERE slug = 'watch-tools');
BEGIN
  IF watch_tools_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO content (
    id,
    site_id,
    title,
    slug,
    body,
    excerpt,
    featured_image,
    type,
    status,
    category_id,
    tags,
    author,
    publish_at,
    meta_title,
    meta_description,
    og_image,
    body_previous,
    ai_generated,
    human_reviewed_at,
    review_state,
    created_at,
    updated_at
  ) VALUES
  (
    gen_random_uuid(),
    watch_tools_id,
    'How to Size a Watch for Your Wrist',
    'how-to-size-a-watch-for-your-wrist',
    $post$
<p>A watch that fits well looks more expensive, feels more comfortable, and is far less likely to sit in a drawer. Sizing is about more than case diameter: the shape of your wrist, the lug-to-lug length, and the strap width all matter. Here is the simple process we use every time we recommend a watch.</p>

<h2>Step 1: Measure your wrist</h2>
<p>Use a soft tape measure or a strip of paper. Wrap it around the flat part of your wrist, just below the wrist bone, where the watch will sit. Mark the overlap and measure it against a ruler. Most adult wrists fall between 6 and 7.5 inches (15–19 cm).</p>

<h2>Step 2: Match case size to wrist size</h2>
<p>As a rough rule of thumb:</p>
<ul>
  <li><strong>Under 6.5 inches:</strong> 34–38mm cases wear best.</li>
  <li><strong>6.5–7 inches:</strong> 38–42mm is the versatile sweet spot.</li>
  <li><strong>Over 7 inches:</strong> 42–44mm and larger look balanced.</li>
</ul>

<h2>Step 3: Check lug-to-lug length</h2>
<p>Lug-to-lug is the distance from the top of the top lug to the bottom of the bottom lug. A 40mm watch with a 50mm lug-to-lug wears much larger than a 40mm watch with a 45mm lug-to-lug. If your wrist is flat, you can go longer. If it is round, keep the lug-to-lug close to or below your wrist width.</p>

<h2>Step 4: Strap width and taper</h2>
<p>A strap that is too wide can overhang; one that is too narrow looks undersized. Standard lug widths are 18mm, 20mm, and 22mm. A slight taper toward the buckle can make a chunky watch look more refined.</p>

<h2>What to do next</h2>
<p>Once you know your numbers, filter our picks by case size. Our <a href="/guide/best-watches-under-300">best watches under $300</a> and <a href="/guide/best-watches-under-500">best watches under $500</a> guides list lug-to-lug and case diameter for every pick.</p>
$post$,
    'A practical guide to measuring your wrist and matching case diameter, lug-to-lug length, and strap width to your build.',
    '',
    'blog',
    'published',
    NULL,
    ARRAY['watches','sizing','fit guide'],
    'Daniel Osei',
    now(),
    'How to Size a Watch for Your Wrist',
    'Measure your wrist and learn how case size, lug-to-lug length, and strap width affect fit before buying your next watch.',
    '',
    '',
    true,
    now(),
    'published',
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    watch_tools_id,
    'Quartz vs Automatic: Which Movement Is Right for You?',
    'quartz-vs-automatic-which-movement',
    $post$
<p>The movement is the engine of the watch. It does not just tell time; it shapes price, accuracy, maintenance, and the overall feel on your wrist. The two most common movements in affordable watches are quartz and automatic. Here is how they compare, and which one fits your lifestyle.</p>

<h2>Quartz movement</h2>
<p>A quartz watch uses a battery and a tiny quartz crystal to keep time. It is accurate, cheap, and low-maintenance. Most quartz watches gain or lose only a few seconds per month. They can also be made very thin, which is why dress watches and minimalist designs often use quartz.</p>
<p><strong>Best for:</strong> everyday wear, budget buyers, people who want a grab-and-go watch.</p>

<h2>Automatic / mechanical movement</h2>
<p>An automatic movement is powered by a mainspring that unwinds slowly. The motion of your wrist winds the spring through a rotor. You never need a battery, but you do need to wear it regularly or use a watch winder. Automatics are less accurate than quartz and usually thicker and more expensive, but many enthusiasts love the sweeping second hand and mechanical charm.</p>
<p><strong>Best for:</strong> hobbyists, people who appreciate craft, anyone who wants a watch with soul.</p>

<h2>Accuracy and maintenance</h2>
<p>Quartz is the clear winner for accuracy and servicing cost. A battery change every 2–3 years is usually the only maintenance. Automatics should be serviced every 5–7 years and will drift a few seconds per day, which is normal.</p>

<h2>Which one should you buy?</h2>
<p>If you want one reliable watch for work and weekends, go quartz. If you want a watch to tinker with, admire, and pass down, go automatic. There is no wrong answer; there is only the answer that matches how you will actually wear it.</p>

<h2>Our top picks by movement</h2>
<p>See our <a href="/guide/best-watches-under-500">best watches under $500</a> guide for a ranked list that includes both quartz and automatic options, with real accuracy notes from our testing.</p>
$post$,
    'Quartz and automatic watches serve different lifestyles. Learn which movement fits your budget, accuracy needs, and maintenance tolerance.',
    '',
    'blog',
    'published',
    NULL,
    ARRAY['watches','movement','quartz','automatic'],
    'Daniel Osei',
    now(),
    'Quartz vs Automatic: Which Movement Is Right for You?',
    'Compare quartz and automatic watch movements. Accuracy, maintenance, and real-world buying advice from hands-on testing.',
    '',
    '',
    true,
    now(),
    'published',
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    watch_tools_id,
    'Vintage Watch Buying Checklist',
    'vintage-watch-buying-checklist',
    $post$
<p>Vintage watches can be incredible value, but they come with risks that new watches do not. A beautiful dial can hide a tired movement, and a low price can mean expensive service bills later. Use this checklist before you buy.</p>

<h2>Inspect the dial and hands</h2>
<p>Look for even patina, intact lume, and no water damage. A spotty or bubbly dial often means moisture got inside. Hands that glow too brightly on a decades-old watch may have been relumed, which lowers collectibility.</p>

<h2>Check the case and lugs</h2>
<p>Polished-out case edges and rounded-off lugs are signs of over-polishing. That removes metal and can devalue the watch. Ask for clear photos of the case sides and lug holes. Sharp, original lines are what you want.</p>

<h2>Ask about service history</h2>
<p>A recently serviced vintage watch is worth a premium. A watch that has not been opened in 20 years may need $100–300 in service soon. Budget for it. If the seller has no service history, assume it needs one.</p>

<h2>Buy the seller, not just the watch</h2>
<p>Reputation matters more than price. Read return policies, ask questions, and be wary of deals that look too good. A seller who refuses detailed photos or returns is a red flag. Good vintage dealers document condition honestly.</p>

<h2>Great places to start</h2>
<p>For first-time vintage buyers, we recommend starting with proven, robust models. Our <a href="/guide/vintage-casio-watches">vintage Casio watches</a> and <a href="/guide/vintage-seiko-watches">vintage Seiko watches</a> guides list affordable, easy-to-service options with specific references to look for.</p>
$post$,
    'A no-nonsense checklist for buying vintage watches: dial condition, case integrity, service history, and how to judge the seller.',
    '',
    'blog',
    'published',
    NULL,
    ARRAY['watches','vintage','buying guide','checklist'],
    'Daniel Osei',
    now(),
    'Vintage Watch Buying Checklist',
    'Avoid expensive mistakes with this vintage watch buying checklist: condition, service history, seller reputation, and where to start.',
    '',
    '',
    true,
    now(),
    'published',
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    watch_tools_id,
    'How We Test and Rank Watches at WristNerd',
    'how-we-test-and-rank-watches',
    $post$
<p>Our rankings are not based on press releases or manufacturer specs. Every watch we recommend has spent real time on a wrist, been measured against an accurate reference, and been compared to other watches in the same price bracket. Here is exactly how we test.</p>

<h2>Real wrist time, minimum two weeks</h2>
<p>First impressions are unreliable. We wear each watch for at least two weeks across normal life: desk work, errands, workouts, and nights out. This reveals comfort issues, strap quality, and whether the watch actually gets wrist time.</p>

<h2>Accuracy timing</h2>
<p>We set each watch against an NTP reference and measure drift after 24 and 48 hours. Quartz should be within a few seconds, automatics within a few seconds per day. We note any positional bias and how consistent the watch is.</p>

<h2>Build and finish</h2>
<p>We inspect case edges, brushing, polishing consistency, crown action, bezel feel, and bracelet end links. We also test the lume by charging it and timing how long it stays readable. The small details separate a good watch from a great one.</p>

<h2>Value scoring</h2>
<p>We rate each watch on accuracy, comfort, finish, features, and price. The final score is weighted toward what matters most at that price point. A $200 watch is not judged against a $2,000 watch; it is judged against the best $200 watches.</p>

<h2>No paid placements, ever</h2>
<p>We buy or borrow every watch we test. Brands cannot pay for placement, and affiliate relationships do not influence rankings. When you buy through our links, we may earn a commission, but it never affects our picks. Read more on our <a href="/how-we-rank">methodology page</a> and <a href="/affiliate-disclosure">affiliate disclosure</a>.</p>
$post$,
    'A behind-the-scenes look at the WristNerd testing process: wrist time, accuracy testing, build grading, and value scoring.',
    '',
    'blog',
    'published',
    NULL,
    ARRAY['watches','methodology','testing','editorial'],
    'Daniel Osei',
    now(),
    'How We Test and Rank Watches at WristNerd',
    'See the hands-on testing process behind WristNerd watch reviews and buying guides. Accuracy, comfort, finish, and value scoring explained.',
    '',
    '',
    true,
    now(),
    'published',
    now(),
    now()
  )
  ON CONFLICT (site_id, slug) DO NOTHING;
END $$;
