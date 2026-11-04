/** Text of the information pages (About, Contact, Privacy, Terms). One source for the React pages AND the server-rendered copy crawlers read. */
export const INFO_SLUGS = ['about', 'contact', 'privacy', 'terms'] as const;
export type InfoSlug = (typeof INFO_SLUGS)[number];
export interface InfoPage { slug: InfoSlug; nav: string; title: string; heading: string; description: string; intro: string; sections: { h: string; p: string[] }[] }
export const LEGAL_UPDATED = '21 October 2026';

export const INFO_PAGES: Record<InfoSlug, InfoPage> = {
  about: {
    slug: 'about', nav: 'About', title: 'About Goal4U | Live Football Scores, Tables & Match Centre', heading: 'About Goal4U',
    description: 'Goal4U is a football scores and stats site: live scores, fixtures, tables, line-ups, shot maps, player profiles, highlights and news from Europe’s top competitions.',
    intro: 'Goal4U is a football site built for fans who want the score, the story of the match and the numbers behind it in one place, on any screen.',
    sections: [
      { h: 'What you will find here', p: ['Live scores and results, fixtures and league tables for the Premier League, La Liga, Serie A, Bundesliga, Ligue 1, the Champions League, the Championship, the World Cup and the European Championship.', 'Every match page has the line-ups on a pitch with player ratings, the match events, a shot map sized by expected goals (xG), team statistics, top performers and the highlights video when one is available. Player pages bring together a player’s season so far, match by match, with their honours and profile.'] },
      { h: 'Where our data comes from', p: ['Fixtures, results, league tables, line-ups, events, ratings, shots, statistics, player profiles, market values and honours come from third-party football data providers. Videos are served by YouTube and the news section links to the original publishers.', 'Live matches refresh about every 20 seconds; everything else refreshes every few minutes. Provider feeds can lag or be corrected after the final whistle, so a number can change.'] },
      { h: 'Independent and unofficial', p: ['Goal4U is an independent project. It is not affiliated with, endorsed by or sponsored by any league, club, federation or player. Club names, crests, player names and photos belong to their respective owners and are shown to identify the teams and players the data is about.'] },
      { h: 'Corrections', p: ['If a score, line-up, player photo or statistic looks wrong, tell us on the contact page and include the link to the page. We fix data problems as quickly as we can.'] },
    ],
  },
  contact: {
    slug: 'contact', nav: 'Contact', title: 'Contact Goal4U | Corrections, Feedback & Enquiries', heading: 'Contact us',
    description: 'Contact Goal4U to report a wrong score or statistic, send feedback, ask about data, or make a business or copyright enquiry.',
    intro: 'We read every message. The more detail you send, the faster we can help.',
    sections: [
      { h: 'Report a wrong score, line-up or statistic', p: ['Send the link to the page and what looks wrong. For a player photo, include the player’s name and the number at the end of their Goal4U page address.'] },
      { h: 'Feedback and ideas', p: ['Tell us what you would like to see: a competition, a statistic, a page, or something that is hard to use on your phone.'] },
      { h: 'Business, privacy and copyright', p: ['For partnership or advertising enquiries, questions about this site’s privacy policy, or a request to remove content you own, write to us and say which page and what you would like us to do.'] },
    ],
  },
  privacy: {
    slug: 'privacy', nav: 'Privacy', title: 'Privacy Policy | Goal4U', heading: 'Privacy Policy',
    description: 'How Goal4U handles your information: no accounts, no sign-up, what is stored in your browser, and which third-party services load on our pages.',
    intro: 'Goal4U does not ask you to create an account or give us personal details. This page explains what happens to your information when you use the site.',
    sections: [
      { h: 'What we collect', p: ['Like any website, our servers and our hosting provider record standard technical logs when a page is requested: your IP address, browser type, the page requested and the time. We use them to run the site, keep it secure and fix problems.', 'We do not sell personal information.'] },
      { h: 'What is stored in your browser', p: ['Goal4U saves your choices, such as light or dark mode, in your browser’s local storage so that they are remembered on your next visit. This stays on your device. You can clear it at any time in your browser settings.'] },
      { h: 'Third-party services', p: ['Some content on our pages is loaded from other services, and those services receive your IP address and browser details when your browser requests it: team crests, player photos and trophies (served through our own servers), and fonts (Google Fonts).', 'Videos are played with YouTube. When you press play, YouTube (Google) may set cookies and collect information under its own privacy policy.', 'Links to news articles take you to the publisher’s website, which has its own policy.'] },
      { h: 'Advertising and analytics', p: ['If we add analytics or advertising in the future, we will list the provider here and explain what it collects, and where the law requires it we will ask for your consent first.'] },
      { h: 'Children', p: ['Goal4U is a general football site and is not directed at children under 13. We do not knowingly collect information from children.'] },
      { h: 'Your choices and rights', p: ['Because we do not hold accounts or profiles, there is very little personal data to access or delete. If you want to ask what we hold, or ask us to delete something, contact us and we will respond.'] },
      { h: 'Changes to this policy', p: ['We may update this policy and will change the date at the top when we do. Continued use of the site means you accept the updated policy.'] },
    ],
  },
  terms: {
    slug: 'terms', nav: 'Terms', title: 'Terms of Use | Goal4U', heading: 'Terms of Use',
    description: 'The terms for using Goal4U: personal use, information only, no betting advice, third-party data and trademarks.',
    intro: 'By using Goal4U you agree to these terms. If you do not agree, please do not use the site.',
    sections: [
      { h: 'Using the site', p: ['Goal4U is provided for your personal, non-commercial use. Please do not misuse it: no attempts to disrupt or overload it, to gain access to anything you are not meant to see, or to copy it in bulk with automated tools.'] },
      { h: 'Information only', p: ['Scores, statistics, ratings, predictions and market values are provided for information and entertainment. They come from third parties, may be delayed, incomplete or later corrected, and are provided “as is” without any promise of accuracy. Nothing on Goal4U is betting, financial or professional advice.'] },
      { h: 'Third-party content and trademarks', p: ['Club names, crests, player names and photos, competition names, videos and news belong to their owners and are used to identify what the data is about. News and video links lead to services we do not control, and we are not responsible for their content.'] },
      { h: 'Our content', p: ['The design and code of Goal4U, and the way its information is organised, belong to us. You may link to our pages and quote small parts with credit. Please do not republish the site or its data as your own.'] },
      { h: 'Availability and liability', p: ['We try to keep the site available, but we do not promise it will be uninterrupted or error-free. To the extent the law allows, Goal4U is not liable for any loss that results from using the site or relying on its information.'] },
      { h: 'Changes', p: ['We may change the site or these terms at any time. The date at the top shows when they were last updated.'] },
    ],
  },
};
