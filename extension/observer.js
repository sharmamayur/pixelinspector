(() => {
  if (globalThis.__pixelMonitorObserver) return;
  globalThis.__pixelMonitorObserver = true;
  let active = false;
  let lastPage = '';
  const send = data => chrome.runtime.sendMessage({ type: 'activity', ...data }).catch(() => {});
  const replayUrl = () => `${location.origin}${location.pathname}`;
  const clean = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  function elementRole(element) {
    const explicit = clean(element.getAttribute('role')).toLowerCase();
    if (explicit) return explicit;
    if (element.matches('a[href], area[href]')) return 'link';
    if (element.matches('button, input[type="button"], input[type="submit"], input[type="reset"]')) return 'button';
    if (element.matches('input[type="checkbox"]')) return 'checkbox';
    if (element.matches('input[type="radio"]')) return 'radio';
    if (element.matches('select')) return 'combobox';
    if (element.matches('textarea, input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input[type="url"]')) return 'textbox';
    return null;
  }
  function elementName(element) {
    // Editable text is user input, not a control label.
    if (element.isContentEditable) return '';
    const labelledBy = clean(element.getAttribute('aria-labelledby'));
    const labelled = labelledBy && labelledBy.split(/\s+/).map(id => clean(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
    if (labelled) return clean(labelled);
    const aria = clean(element.getAttribute('aria-label'));
    if (aria) return aria;
    const label = element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return clean(label.textContent);
    const imageAlt = clean(element.querySelector?.('img[alt]')?.getAttribute('alt'));
    if (imageAlt) return imageAlt;
    if (element.matches('input[type="button"], input[type="submit"], input[type="reset"]')) return clean(element.value);
    if (element.matches('input, textarea, select')) return clean(element.getAttribute('title'));
    return clean(element.innerText || element.getAttribute('title') || element.getAttribute('alt'));
  }
  function stableToken(value) {
    const token = clean(value);
    return token && token.length <= 80 && !/[a-f\d]{16,}/i.test(token) && !/\d{6,}/.test(token) ? token : null;
  }
  function uniqueSelector(element) {
    const tag = element.localName;
    const id = stableToken(element.id);
    if (id) {
      const selector = `#${CSS.escape(id)}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    for (const attribute of ['data-testid', 'data-test', 'data-qa', 'data-cy']) {
      const value = stableToken(element.getAttribute(attribute));
      if (!value) continue;
      const selector = `${tag}[${attribute}="${CSS.escape(value)}"]`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    const parts = [];
    let current = element;
    while (current?.localName && current !== document.documentElement && parts.length < 6) {
      let part = current.localName;
      const classes = [...current.classList].map(stableToken).filter(Boolean).filter(name => !/^(active|selected|open|focus|hover|disabled)$/i.test(name)).slice(0, 2);
      if (classes.length) part += classes.map(name => `.${CSS.escape(name)}`).join('');
      const siblings = current.parentElement ? [...current.parentElement.children].filter(child => child.localName === current.localName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      const selector = parts.join(' > ');
      try { if (document.querySelectorAll(selector).length === 1) return selector; } catch {}
      current = current.parentElement;
    }
    return parts.join(' > ').slice(0, 500) || tag;
  }
  function captureElement(element) {
    const role = elementRole(element);
    const name = elementName(element);
    return { tag: element.localName.slice(0, 40), role, name, selector: uniqueSelector(element) };
  }
  function flash(element) {
    element.animate?.([
      { boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.95)' },
      { boxShadow: '0 0 0 3px rgba(37, 99, 235, 0)' },
    ], { duration: 650, easing: 'ease-out' });
  }
  function snapshot() {
    if (!active) return;
    const product = /\/(products?|p)\//i.test(location.pathname) || document.querySelector('meta[property="og:type"][content="product"], [itemtype$="/Product"]');
    lastPage = location.href;
    send({ action: product ? 'product' : 'page', url: replayUrl() });
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'observe-start') { if (!active) { active = true; snapshot(); } }
    if (message.type === 'observe-stop') active = false;
  });
  chrome.runtime.sendMessage({ type: 'observe' }).then(result => { if (!active && result?.active) { active = true; snapshot(); } }).catch(() => {});
  document.addEventListener('click', event => {
    if (!active || !event.isTrusted) return;
    const path = event.composedPath?.() || [];
    const origin = path.find(node => node instanceof Element) || event.target;
    const element = origin?.closest?.('a, button, input, select, textarea, summary, [role], [onclick], [tabindex]') || origin;
    if (!element) return;
    const locator = captureElement(element);
    const controlName = locator.name;
    const label = controlName.toLowerCase();
    const action = /^(add to (cart|bag|basket))(\s|$)/.test(label) ? 'cart'
      : /^(checkout|check out|proceed to checkout|begin checkout|secure checkout)(\s|$)/.test(label) ? 'checkout'
      : 'click';
    flash(element);
    send({ action, locator });
  }, true);
  document.addEventListener('submit', event => { if (active && event.isTrusted) send({ action: 'form' }); }, true);
  setInterval(() => { if (active && location.href !== lastPage) snapshot(); }, 1000);
})();
