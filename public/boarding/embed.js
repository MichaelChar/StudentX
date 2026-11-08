/*
  StudentX — Swiss boarding quiz embed. PARKED 2026-11-08: THIS IS A NO-OP STUB.

    <script src="https://studentx.uk/boarding/embed.js"></script>

  Partners paste that line on their own sites, so the URL must keep answering
  with a valid script — a 404 would log an error on every page that has it. While
  the boarding product is parked (src/lib/boardingParked.js) the script does
  nothing: no iframe, no network request, nothing on the page.

  The real embed is in git history. To bring it back, restore it with
    git log --follow public/boarding/embed.js
  (the version before the "park boarding" commit) and set BOARDING_ENABLED to
  true. __tests__/config/boardingParked.test.js fails if the two disagree.

  Plain ES5, like the original, because it runs on other people's pages.
*/
(function () {})();
