/**
 * Content engine. No AI API, no paid service: deterministic, professional copy
 * composed from a curated topic bank so a post costs exactly zero every day.
 */

var TOPIC_BANK = [
  { tag: 'proof', headline: 'A dashboard is only useful if the numbers are true',
    body: 'We build finance dashboards that reconcile with the source data, not just look good in a screenshot. Every KPI is traceable to a row you can open.',
    cta: 'See a live sample workbook built with 1,000 real rows.' },
  { tag: 'proof', headline: 'Your website is your hardest working salesperson',
    body: 'A clear services page, real samples and one obvious way to contact you will earn more than any ad budget. We build exactly that, in days not months.',
    cta: 'Look at the portfolio and judge the work yourself.' },
  { tag: 'service', headline: 'Custom Node.js APIs that stay fast under load',
    body: 'Express or Fastify, MySQL or Postgres, JWT auth, clean REST endpoints and tests. Documented so your next developer is not lost.',
    cta: 'Starter builds begin at $69.' },
  { tag: 'service', headline: 'Flutter apps for Android and iOS from one codebase',
    body: 'One build, two stores, no duplicated logic. Offline-first storage and real device testing before release.',
    cta: 'Tell us the screens you need and we will scope it honestly.' },
  { tag: 'service', headline: 'Laravel and PHP backends, maintained not abandoned',
    body: 'Most small businesses already run PHP. We repair, secure and extend what you have instead of forcing a rewrite.',
    cta: 'Send the repo link for a free 20 minute review.' },
  { tag: 'service', headline: 'Excel tools that behave like software',
    body: 'Trackers, loan calculators, inventory sheets and attendance registers with a dashboard, charts and a read-me that explains where to paste new data.',
    cta: 'Four sample workbooks are downloadable from the portfolio.' },
  { tag: 'education', headline: 'Why your page speed matters more than your design',
    body: 'A visitor on a phone in a weak network gives you three seconds. Compressed images, fewer scripts and a real host will beat any animation.',
    cta: 'We test every build on a throttled mobile connection before handover.' },
  { tag: 'education', headline: 'The five pages every service business actually needs',
    body: 'Home, services with prices, proof, about, contact. Anything more is optional until you have traffic.',
    cta: 'We can launch those five pages in under a week.' },
  { tag: 'education', headline: 'HTTPS is not optional in 2026',
    body: 'Browsers warn visitors, payment providers refuse, and search engines demote. A free certificate solves it in minutes.',
    cta: 'Every site we ship is HTTPS with automatic renewal.' },
  { tag: 'education', headline: 'A backup you have never restored is not a backup',
    body: 'Test the restore once a quarter. A five minute check is cheaper than a lost client database.',
    cta: 'We include a restore test in every handover.' },
  { tag: 'process', headline: 'How a GAHONSH project runs, start to finish',
    body: 'Written scope, 50 percent to start, weekly demo, then handover with the repo and credentials. No surprise invoices.',
    cta: 'Ask for the one page scope template.' },
  { tag: 'process', headline: 'You will see progress every week, not at the end',
    body: 'A staging link goes live in week one and updates as we build. Feedback lands while changes are still cheap.',
    cta: 'Book a short call and we will show you a staging build.' },
  { tag: 'process', headline: 'What we need from you to start today',
    body: 'Your logo, your services and prices, a few photos, and one person who can approve. That is the whole list.',
    cta: 'Send those four things and we begin the same week.' },
  { tag: 'process', headline: 'Fixed price, fixed scope, written down',
    body: 'Scope changes are quoted before they are built. You always know what a change costs before saying yes.',
    cta: 'Every project starts with the same short scope document.' },
  { tag: 'offer', headline: 'A landing page that converts, delivered in 3 days',
    body: 'One page, mobile first, contact form wired to your email, and the copy tightened so the offer is obvious.',
    cta: 'Starter package is $69 with a 2 to 4 day turnaround.' },
  { tag: 'offer', headline: 'Need a web app, not a brochure site?',
    body: 'Authentication, dashboards, payments and an admin panel, built on Node.js and a managed database.',
    cta: 'Professional package is $249 and includes deployment.' },
  { tag: 'offer', headline: 'Free 20 minute review of your current site',
    body: 'We will list the five things costing you enquiries, in plain language, whether or not you hire us.',
    cta: 'Email to request a slot.' },
  { tag: 'offer', headline: 'Fix a bug without rebuilding everything',
    body: 'Bring us the problem, we quote the fix, you pay only for that fix. No retainer required.',
    cta: 'Service cards start at $25.' },
  { tag: 'trust', headline: 'You own everything we build',
    body: 'Repository, hosting account, database and domain stay in your name. We hand over credentials at handover, not hold them hostage.',
    cta: 'Ask for the handover checklist.' },
  { tag: 'trust', headline: 'NDA signed before we see your data',
    body: 'Client data stays on your infrastructure. We do not reuse screenshots or numbers without written permission.',
    cta: 'We can sign your NDA or send ours.' },
  { tag: 'trust', headline: 'Seven days of bug support after every delivery',
    body: 'Anything we broke, we fix free. Anything new is quoted. That line is in writing before work starts.',
    cta: 'Read the terms on the site.' },
  { tag: 'global', headline: 'Working across time zones without losing a day',
    body: 'Americas, UK, Gulf, Singapore and Australia. Morning handovers, written updates, no calls needed unless you want them.',
    cta: 'We invoice in USD and accept international transfer.' },
  { tag: 'global', headline: 'Why international clients hire a small studio',
    body: 'You talk to the person writing the code, not an account manager reading a ticket. Decisions take minutes.',
    cta: 'Current availability is two project slots.' },
  { tag: 'insight', headline: 'Most small business sites fail on one thing: no clear next step',
    body: 'Every page should answer one question and offer one action. We rebuild the navigation around that single idea.',
    cta: 'See how the services page is structured on the site.' }
];

var WEEKDAY_FOCUS = ['trust', 'service', 'education', 'process', 'offer', 'proof', 'insight'];

var HASHTAGS = {
  proof: ['#WebDevelopment', '#Portfolio', '#Dashboard', '#BuildInPublic'],
  service: ['#NodeJS', '#Flutter', '#Laravel', '#WebApp'],
  education: ['#WebTips', '#SmallBusiness', '#WebsiteSpeed', '#SEO'],
  process: ['#Freelance', '#ClientWork', '#ProjectManagement', '#Transparency'],
  offer: ['#FreelanceDeveloper', '#WebsiteDesign', '#LaunchFast', '#SmallBusiness'],
  trust: ['#FreelanceLife', '#ClientFirst', '#NDA', '#Handover'],
  global: ['#RemoteWork', '#FreelanceDeveloper', '#GlobalClients', '#Outsourcing'],
  insight: ['#BusinessGrowth', '#WebStrategy', '#Conversion', '#FreelanceDeveloper']
};

function pickTopic_(date) {
  var focus = WEEKDAY_FOCUS[date.getDay()];
  var pool = TOPIC_BANK.filter(function (topic) { return topic.tag === focus; });
  if (!pool.length) pool = TOPIC_BANK;
  return pool[dayIndex_(date, pool.length)];
}

function hashtagsFor_(tag) {
  var base = HASHTAGS[tag] || HASHTAGS.service;
  return base.concat(['#GAHONSH', '#FreelanceDeveloperIndia']).join(' ');
}

var HINDI_NAMES = {
  'Diwali': '\u0926\u093f\u0935\u093e\u0932\u0940',
  'Holi': '\u0939\u094b\u0932\u0940',
  'Holika Dahan': '\u0939\u094b\u0932\u093f\u0915\u093e \u0926\u0939\u0928',
  'Eid al-Fitr': '\u0908\u0926',
  'Eid al-Adha': '\u092c\u0915\u0930\u0940\u0926',
  'Christmas': '\u0915\u094d\u0930\u093f\u0938\u092e\u0938',
  'New Year': '\u0928\u0935\u0935\u0930\u094d\u0937',
  'Makar Sankranti': '\u092e\u0915\u0930 \u0938\u0902\u0915\u094d\u0930\u093e\u0902\u0924\u093f',
  'Maha Shivratri': '\u092e\u0939\u093e\u0936\u093f\u0935\u0930\u093e\u0924\u094d\u0930\u093f',
  'Ram Navami': '\u0930\u093e\u092e \u0928\u0935\u092e\u0940',
  'Raksha Bandhan': '\u0930\u0915\u094d\u0937\u093e \u092c\u0902\u0927\u0928',
  'Janmashtami': '\u091c\u0928\u094d\u092e\u093e\u0937\u094d\u091f\u092e\u0940',
  'Ganesh Chaturthi': '\u0917\u0923\u0947\u0936 \u091a\u0924\u0941\u0930\u094d\u0925\u0940',
  'Dussehra': '\u0926\u0936\u0939\u0930\u093e',
  'Bhai Dooj': '\u092d\u093e\u0908 \u0926\u0942\u091c',
  'Guru Nanak Jayanti': '\u0917\u0941\u0930\u0941 \u0928\u093e\u0928\u0915 \u091c\u092f\u0902\u0924\u0940',
  'Independence Day': '\u0938\u094d\u0935\u0924\u0902\u0924\u094d\u0930\u0924\u093e \u0926\u093f\u0935\u0938',
  'Republic Day': '\u0917\u0923\u0924\u0902\u0924\u094d\u0930 \u0926\u093f\u0935\u0938'
};

function hindiGreeting_(occasion) {
  var name = HINDI_NAMES[occasion] || occasion;
  return '\u0938\u092d\u0940 \u0915\u094b ' + name + ' \u0915\u0940 \u0939\u093e\u0930\u094d\u0926\u093f\u0915 \u0936\u0941\u092d\u0915\u093e\u092e\u0928\u093e\u090f\u0901\u0964';
}

/**
 * Build the day's post. Pure function of the date plus calendar state.
 * Returns { dateKey, type, occasion, headline, caption, hashtags, link, title }
 */
function buildDailyPost(date) {
  var when = date || new Date();
  var key = dateKey_(when);
  var classified = classifyDay_(when);
  var post;

  if (classified.type === 'festival') {
    var occasion = classified.occasion || 'the festival';
    var headline = 'Happy ' + occasion + ' from ' + CONFIG.brand;
    var lines = [
      headline + '.',
      'Wishing you a calm, prosperous and happy ' + occasion + ' from all of us at ' + CONFIG.brand + '.',
      'While you celebrate, we are quietly keeping client websites fast, secure and online.'
    ];
    if (prop_('BILINGUAL_HINDI', 'yes') === 'yes') lines.push(hindiGreeting_(occasion));
    lines.push('We build websites, web apps and dashboards for businesses worldwide. ' + CONFIG.website);
    post = {
      headline: headline,
      caption: lines.join('\n\n'),
      hashtags: ['#' + occasion.replace(/[^A-Za-z0-9]/g, ''), '#Festival', '#GAHONSH', '#WebDevelopment', '#FreelanceDeveloper'].join(' '),
      tag: 'festival'
    };
  } else if (classified.type === 'occasion') {
    var occasion2 = classified.occasion || 'today';
    post = {
      headline: occasion2 + ': a good day to fix the website',
      caption: [
        occasion2 + ' is a good moment to check that your business is easy to find online.',
        'Three things worth doing today: put your prices on the services page, add one recent sample, and make the contact button obvious.',
        'If you want it done for you, we ship a landing page in three days. ' + CONFIG.website
      ].join('\n\n'),
      hashtags: ['#' + occasion2.replace(/[^A-Za-z0-9]/g, ''), '#SmallBusiness', '#GAHONSH', '#FreelanceDeveloper'].join(' '),
      tag: 'offer'
    };
  } else if (classified.override && classified.override.headline) {
    post = { headline: classified.override.headline, caption: classified.override.caption, hashtags: hashtagsFor_('service'), tag: 'service' };
  } else {
    var topic = (classified.override && classified.override.topic)
      ? { tag: 'service', headline: classified.override.topic, body: '', cta: 'See the work at ' + CONFIG.portfolio }
      : pickTopic_(when);
    var caption = [topic.headline + '.', topic.body, topic.cta, CONFIG.website].filter(Boolean).join('\n\n');
    if (classified.override && classified.override.caption) caption = classified.override.caption + '\n\n' + CONFIG.website;
    post = { headline: topic.headline, caption: caption, hashtags: hashtagsFor_(topic.tag), tag: topic.tag };
  }

  // Hard guarantee: every single post carries the website link.
  if (post.caption.indexOf(CONFIG.website) === -1) post.caption += '\n\n' + CONFIG.website;

  return {
    dateKey: key,
    type: classified.type,
    source: classified.source,
    occasion: classified.occasion,
    headline: post.headline,
    caption: post.caption,
    hashtags: post.hashtags,
    link: CONFIG.website,
    title: post.headline + ' | ' + CONFIG.brand,
    imageUrl: (classified.override && classified.override.imageUrl) || ''
  };
}

/** Full text used by blog publishing. */
function postHtml_(post, imageUrl) {
  var paragraphs = post.caption.split('\n\n').map(function (line) {
    return '<p>' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>';
  }).join('\n');
  var img = imageUrl ? '<img src="' + imageUrl + '" alt="' + post.headline.replace(/"/g, '') + '" style="max-width:100%;height:auto" />' : '';
  return img + '\n' + paragraphs + '\n<p><a href="' + CONFIG.portfolio + '">See the portfolio</a> | <a href="' + CONFIG.website + '">' + CONFIG.website + '</a></p>';
}
