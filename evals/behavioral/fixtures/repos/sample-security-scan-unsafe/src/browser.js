// The URL fragment is attacker-controlled; no sanitizer intervenes.
const fragment = decodeURIComponent(window.location.hash.slice(1));
document.querySelector('#preview').innerHTML = fragment;
