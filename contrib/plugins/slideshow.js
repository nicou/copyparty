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
//   where you can configure:
//     * how long each pic/vid stays on screen
//     * shuffle-mode (each file once per cycle, in random order)
//     * whether videos play to the end instead of being cut short
//     * whether to loop forever or stop after the last file
//     * whether to enter fullscreen while the slideshow runs
//
//   settings are remembered (localStorage)


(function () {

    var DEFAULT_SECS = 7;  // default time per pic/vid

    // ===
    // ===   END OF CONFIG
    // ===

    var running = false,
        tick_timer = null,
        prog_timer = null,
        arm_t0 = 0,       // when the current slide got its timer
        armed_idx = -1,   // the slide the current timer was armed for
        went_fs = false,  // slideshow entered fullscreen (so undo on stop)
        bag = null;       // shuffle-mode: upcoming slides this cycle

    function get_secs() {
        var v = parseFloat(sread('ss_secs'));
        return (!isNum(v) || v < 0.5) ? DEFAULT_SECS : v;
    }

    function get_shuffle() {
        return sread('ss_shuffle') == '1';
    }

    function get_vidfull() {
        return sread('ss_vidfull') != '0';
    }

    function get_loop() {
        return sread('ss_loop') != '0';
    }

    function get_fs() {
        return sread('ss_fs') == '1';
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

    function cur_vid() {
        var slider = ebi('bbox-slider'),
            fig = slider && slider.children[cur_slide()];

        return fig && fig.querySelector('video');
    }

    // a shuffled 0..n-1; if `drop`, the file `cur` is removed
    // (it's on screen already), otherwise it's just kept away
    // from the first position so cycles don't repeat a file
    function mkbag(n, cur, drop) {
        var a = [], i, j, t;
        for (i = 0; i < n; i++)
            a.push(i);

        for (i = n - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1));
            t = a[i]; a[i] = a[j]; a[j] = t;
        }

        i = a.indexOf(cur);
        if (drop)
            a.splice(i, 1);
        else if (!i) {
            a[0] = a[n - 1];
            a[n - 1] = cur;
        }
        return a;
    }

    function advance() {
        var n = num_slides(),
            cur = cur_slide(),
            next = -1;

        if (get_shuffle()) {
            if (bag === null)
                bag = mkbag(n, cur, true);

            if (!bag.length && get_loop())
                bag = mkbag(n, cur);

            if (bag.length)
                next = bag.shift();
        }
        else if (cur + 1 < n)
            next = cur + 1;
        else if (get_loop() && n > 1)
            next = 0;

        if (next < 0) {
            stop();
            return toast.inf(2, 'slideshow finished');
        }

        baguetteBox.show(next);
        arm(next);
    }

    function arm(idx) {
        // some animation styles update the slider-offset async,
        // so callers who know the target index pass it explicitly
        clearTimeout(tick_timer);
        armed_idx = idx === undefined ? cur_slide() : idx;
        arm_t0 = Date.now();
        tick_timer = setTimeout(tick, get_secs() * 1000);
    }

    // clock-face countdown in the stop-button background
    function paint_prog() {
        var btn = ebi('bbox-ssplay');
        if (!running || !btn)
            return;

        var frac, v = cur_vid();
        if (v && get_vidfull() && !v.loop && !v.ended && !v.paused && v.duration > 0)
            frac = v.currentTime / v.duration;
        else
            frac = (Date.now() - arm_t0) / (get_secs() * 1000);

        frac = Math.max(0, Math.min(1, frac || 0));
        btn.style.background = 'conic-gradient(#d48 ' + (frac * 360) + 'deg, #502 0)';
    }

    function tick() {
        if (!running)
            return;

        if (!gallery_open())
            return stop();

        if (cur_slide() != armed_idx)
            // someone navigated manually; give the
            // new slide its full time on screen
            return arm();

        var v = cur_vid();
        if (v && get_vidfull() && !v.loop && !v.ended && !v.paused)
            // video is still playing; check again soon
            return tick_timer = setTimeout(tick, 500);

        advance();
    }

    function start() {
        running = true;
        bag = null;
        set_btn();
        prog_timer = setInterval(paint_prog, 100);

        if (get_fs() && !document.fullscreenElement) {
            went_fs = true;
            try { ebi('bbox-full').click(); } catch (ex) { }
        }

        arm();
    }

    function stop() {
        running = false;
        clearTimeout(tick_timer);
        clearInterval(prog_timer);
        set_btn();

        if (went_fs) {
            went_fs = false;
            if (document.fullscreenElement)
                try { ebi('bbox-full').click(); } catch (ex) { }
        }
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

        // same active-state styling as the other gallery buttons,
        // but round like a watchface; paint_prog fills in the dial
        btn.style.color = running ? '#fff' : '';
        btn.style.background = running ? 'conic-gradient(#d48 0deg, #502 0)' : '';
        btn.style.borderRadius = running ? '50%' : '';
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
            '<label><input type="checkbox" id="bbox-ssvfull" /> vids: play to end</label>' +
            '<label><input type="checkbox" id="bbox-ssloop" /> loop forever</label>' +
            '<label><input type="checkbox" id="bbox-ssfs" /> fullscreen</label>' +
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

        ebi('bbox-sssecs').onchange = function () {
            var v = parseFloat(this.value);
            if (isNum(v) && v >= 0.5)
                swrite('ss_secs', v);
        };
        ebi('bbox-ssshuf').onchange = function () {
            swrite('ss_shuffle', this.checked ? '1' : '0');
            bag = null;  // order changed; deal a fresh cycle
        };
        ebi('bbox-ssvfull').onchange = function () {
            swrite('ss_vidfull', this.checked ? '1' : '0');
        };
        ebi('bbox-ssloop').onchange = function () {
            swrite('ss_loop', this.checked ? '1' : '0');
        };
        ebi('bbox-ssfs').onchange = function () {
            swrite('ss_fs', this.checked ? '1' : '0');
        };
        ebi('bbox-ssok').onclick = function (e) {
            ev(e);
            panel.style.display = 'none';
        };

        load_panel();
        return panel;
    }

    function load_panel() {
        ebi('bbox-sssecs').value = get_secs();
        ebi('bbox-ssshuf').checked = get_shuffle();
        ebi('bbox-ssvfull').checked = get_vidfull();
        ebi('bbox-ssloop').checked = get_loop();
        ebi('bbox-ssfs').checked = get_fs();
    }

    function toggle_panel(e) {
        ev(e);
        var existed = ebi('bbox-sspanel'),
            panel = build_panel(),
            show = !existed || panel.style.display == 'none';

        panel.style.display = show ? '' : 'none';
        if (show)
            load_panel();
    }

    function inject() {
        var btns = ebi('bbox-btns');
        if (!btns || ebi('bbox-ssplay'))
            return;

        // the overlay got rebuilt; any running slideshow died with it
        running = false;
        clearTimeout(tick_timer);
        clearInterval(prog_timer);

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
