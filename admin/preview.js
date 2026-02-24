const h = window.React.createElement;

const listItems = (items = []) =>
  h(
    'ul',
    { style: { margin: '12px 0 0', paddingLeft: '20px' } },
    items.map((item, idx) =>
      h('li', { key: `${item?.venue_name || 'item'}-${idx}` }, item?.venue_name || '')
    )
  );

const HomepagePreview = ({ entry }) => {
  const title = entry.getIn(['data', 'hero_headline']) || '';
  const eyebrow = entry.getIn(['data', 'hero_eyebrow']) || '';
  const subheading = entry.getIn(['data', 'hero_subheading']) || '';
  const socialImage = entry.getIn(['data', 'social_image']) || '';
  const quickList = entry.getIn(['data', 'hero_quick_list'])?.toJS?.() || [];
  const newsletterEyebrow = entry.getIn(['data', 'newsletter_eyebrow']) || '';
  const newsletterHeadline = entry.getIn(['data', 'newsletter_headline']) || '';
  const newsletterDescription = entry.getIn(['data', 'newsletter_description']) || '';

  return h(
    'main',
    { style: { fontFamily: 'system-ui, sans-serif', padding: '24px', lineHeight: 1.4, color: '#111' } },
    h('p', { style: { textTransform: 'uppercase', letterSpacing: '0.12em', color: '#0b7c78', fontWeight: 700, fontSize: '12px' } }, eyebrow),
    h('h1', { style: { fontSize: '42px', margin: '0 0 12px' } }, title),
    h('p', { style: { maxWidth: '680px', color: '#444', marginBottom: '16px' } }, subheading),
    h('h3', { style: { margin: '20px 0 6px' } }, 'Quick List Preview'),
    listItems(quickList),
    socialImage
      ? h('img', {
          src: socialImage,
          alt: 'Social preview',
          style: { width: '100%', maxWidth: '680px', marginTop: '18px', border: '1px solid #ddd' },
        })
      : null,
    h('section', { style: { marginTop: '28px', padding: '16px', background: '#f7f7f7', border: '1px solid #e3e3e3' } }, [
      h('p', { key: 'ey', style: { textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.12em', color: '#0b7c78', marginBottom: '4px' } }, newsletterEyebrow),
      h('h2', { key: 'hl', style: { margin: '0 0 8px' } }, newsletterHeadline),
      h('p', { key: 'desc', style: { margin: 0, color: '#555' } }, newsletterDescription),
    ])
  );
};

window.CMS.registerPreviewTemplate('homepage', HomepagePreview);
