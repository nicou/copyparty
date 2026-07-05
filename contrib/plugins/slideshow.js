"use strict";


// USAGE:
//   place this file somewhere in the webroot,
//   for example in a folder named "res", and then
//   python3 copyparty-sfx.py -v .::r --js-browser /res/slideshow.js
//
// DESCRIPTION:
//   adds a slideshow feature to the image/video gallery;
//
//   a play-button (▶) is added to the gallery toolbar which starts
//   a slideshow; the button then turns into a stop-button (⏹) while
//   the slideshow is running
//
//   next to it is an options-button (⚙) which opens a small panel
//   where you can configure how long each pic/vid stays on screen,
//   and toggle shuffle-mode (visit files in random order)
//
//   settings are remembered (localStorage)


(function () {

    var DEFAULT_SECS = 7;  // default time per pic/vid

    // ===
    // ===   END OF CONFIG
    // ===

    var running = false,
        tick_timer = null;

    function get_secs() {
        var v = parseFloat(sread('ss_secs'));
        return (!isNum(v) || v < 0.5) ? DEFAULT_SECS : v;
    }

    function get_shuffle() {
        return sread('ss_shuffle') == '1';
    }

    function gallery_open() {
        var ov = ebi('bbox-overlay');
        return ov && clgot(ov, 'visible');
    }

    function num_slides() {
        var slider = ebi('bbox-slider');
        return slider ? slider.childElementCount : 0;
    }

    function cur_slide() {
        // the slider is offset by -100% per slide (or +100% in rtl mode)
        var slider = ebi('bbox-slider'),
            s = slider ? (slider.style.transform || slider.style.left || '') : '',
            m = /(-?[0-9.]+)%/.exec(s);

        return m ? Math.round(Math.abs(parseFloat(m[1])) / 100) : 0;
    }

    function advance() {
        var n = num_slides();
        if (n < 2)
            return;

        var cur = cur_slide(), next;
        if (get_shuffle()) {
            // random pick, but never the current one
            next = Math.floor(Math.random() * (n - 1));
            if (next >= cur)
                next++;
        }
        else
            next = (cur + 1) % n;

        baguetteBox.show(next);
    }

    function tick() {
        if (!running)
            return;

        if (!gallery_open())
            return stop();

        advance();
        tick_timer = setTimeout(tick, get_secs() * 1000);
    }

    function start() {
        running = true;
        set_btn();
        tick_timer = setTimeout(tick, get_secs() * 1000);
    }

    function stop() {
        running = false;
        clearTimeout(tick_timer);
        set_btn();
    }

    function toggle(e) {
        ev(e);
        running ? stop() : start();
        if (tt.en)
            tt.show.call(ebi('bbox-ssplay'));
    }

    function set_btn() {
        var btn = ebi('bbox-ssplay');
        if (!btn)
            return;

        var msg = running ? 'Stop slideshow' : 'Start slideshow';
        btn.textContent = running ? '⏹' : '▶';
        btn.setAttribute('tt', msg);
        btn.setAttribute('aria-label', msg);

        // same active-state styling as the other gallery buttons
        btn.style.color = running ? '#fff' : '';
        btn.style.background = running ? '#d48' : '';
        btn.style.textShadow = running ? '1px 1px 0 #b38' : '';
        btn.style.boxShadow = running ? '.15em .15em 0 #502' : '';
    }

    function build_panel() {
        var panel = ebi('bbox-sspanel');
        if (panel)
            return panel;

        panel = mknod('div', 'bbox-sspanel');
        panel.innerHTML = (
            '<h3>slideshow options</h3>' +
            '<label>time per pic/vid: <input type="number" id="bbox-sssecs" min="0.5" step="0.5" style="width:4em" /> sec</label>' +
            '<label><input type="checkbox" id="bbox-ssshuf" /> shuffle</label>' +
            '<a href="#" id="bbox-ssok" class="btn">close</a>'
        );
        panel.style.cssText = (
            'position:absolute;top:2.6em;right:.4em;z-index:20;' +
            'background:#333;color:#ddd;border:1px solid #777;border-radius:.3em;' +
            'padding:.8em 1em;font-size:1em;text-align:left;box-shadow:0 .2em 1em #000'
        );
        var els = panel.querySelectorAll('h3,label');
        for (var a = 0; a < els.length; a++)
            els[a].style.cssText += ';display:block;margin:.3em 0;color:#ddd';

        // keep hotkeys (video-seek digits etc) away from the gallery
        // while typing in the panel
        panel.addEventListener('keydown', function (e) {
            e.stopPropagation();
        });

        // panel lives inside the overlay so it stays visible in fullscreen
        ebi('bbox-overlay').appendChild(panel);

        var secs = ebi('bbox-sssecs'),
            shuf = ebi('bbox-ssshuf');

        secs.value = get_secs();
        shuf.checked = get_shuffle();

        secs.onchange = function () {
            var v = parseFloat(this.value);
            if (isNum(v) && v >= 0.5)
                swrite('ss_secs', v);
        };
        shuf.onchange = function () {
            swrite('ss_shuffle', this.checked ? '1' : '0');
        };
        ebi('bbox-ssok').onclick = function (e) {
            ev(e);
            panel.style.display = 'none';
        };

        return panel;
    }

    function toggle_panel(e) {
        ev(e);
        var existed = ebi('bbox-sspanel'),
            panel = build_panel(),
            show = !existed || panel.style.display == 'none';

        panel.style.display = show ? '' : 'none';
        if (show) {
            ebi('bbox-sssecs').value = get_secs();
            ebi('bbox-ssshuf').checked = get_shuffle();
        }
    }

    function inject() {
        var btns = ebi('bbox-btns');
        if (!btns || ebi('bbox-ssplay'))
            return;

        // the overlay got rebuilt; any running slideshow died with it
        running = false;
        clearTimeout(tick_timer);

        var play = mknod('button', 'bbox-ssplay'),
            opts = mknod('button', 'bbox-ssopts');

        play.setAttribute('type', 'button');
        opts.setAttribute('type', 'button');
        opts.textContent = '⚙';
        opts.setAttribute('tt', 'Slideshow options');
        opts.setAttribute('aria-label', 'Slideshow options');

        var close = ebi('bbox-close');
        btns.insertBefore(opts, close);
        btns.insertBefore(play, opts);
        set_btn();

        play.onclick = toggle;
        opts.onclick = toggle_panel;
        tt.att(btns);
    }

    // the gallery overlay is created lazily (and destroyed when
    // changing folders), so periodically ensure our buttons exist
    setInterval(inject, 250);

})();
