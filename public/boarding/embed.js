/*
  StudentX — Swiss boarding quiz embed.

    <script src="https://studentx.uk/boarding/embed.js"></script>

  Puts the quiz in an iframe right where this script tag sits. The iframe
  grows to fit each step, so it never scrolls inside itself, and after each
  step it scrolls back into view if the visitor had scrolled past its top.
  Optional `data-ref="yoursite"` (letters, digits, dashes) tags the leads
  that come from your site. Details: https://studentx.uk/boarding/partners

  Kept to plain ES5 and no dependencies: it runs on other people's pages, in
  whatever browser their visitors use. The URL is permanent — partners paste
  it once — so change this file in place, never rename it.
*/
(function () {
  var script = document.currentScript;
  if (!script || !script.parentNode) return;

  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch (e) {
    return;
  }

  var ref = (script.getAttribute('data-ref') || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  var frame = 'sx' + Math.random().toString(36).slice(2, 10);

  var iframe = document.createElement('iframe');
  iframe.src =
    origin + '/boarding/quiz/embed?frame=' + frame + (ref ? '&ref=' + encodeURIComponent(ref) : '');
  iframe.title = 'Swiss boarding school quiz, by StudentX';
  iframe.setAttribute('scrolling', 'no');
  iframe.style.cssText =
    'display:block;width:100%;max-width:560px;height:660px;margin:0 auto;' +
    'border:0;background:transparent;color-scheme:light;overflow:hidden';
  script.parentNode.insertBefore(iframe, script.nextSibling);

  window.addEventListener('message', function (event) {
    if (event.origin !== origin || event.source !== iframe.contentWindow) return;
    var data = event.data || {};
    if (data.frame !== frame) return;
    if (data.type === 'sx-boarding:height' && data.height > 0) {
      iframe.style.height = Math.ceil(data.height) + 'px';
    } else if (data.type === 'sx-boarding:step' && iframe.getBoundingClientRect().top < 0) {
      iframe.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });
})();
