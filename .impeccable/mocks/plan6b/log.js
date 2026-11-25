/* Keel, Plan 6B comps: the trade log's sample rows (comps 02 and 03). Set window.LOG_PICKED to the selected serials first. */
(function () {
// Sample rows: [serial, day, time, root, contract, side, qty, entry, exit, net, roi, r, dur, strategy, tags, mistake, patterns, rules, rating, reviewed]
var R = [
  [1231, '25 Nov', '10:22', 'MES', 'Dec 26', 'Short', '4', '6,621.50', '6,615.25', '+$119.80', '+0.09%', '+1.04R', '12m 40s', 'Level reversal', 1, 0, 1, '5 of 5', 4, 1, [['reversal','setups']]],
  [1230, '25 Nov', '09:58', 'ES', 'Dec 26', 'Long', '1', '6,615.00', '6,619.25', '+$207.16', '+0.06%', '+0.83R', '7m 32s', 'Opening range breakout', 1, 0, 0, '5 of 5', 0, 0, [['opening range','setups']]],
  [1229, '25 Nov', '09:41', 'ES', 'Dec 26', 'Long', '2', '6,611.88', '6,618.75', '+$676.82', '+0.10%', '+2.26R', '10m 53s', 'Opening range breakout', 2, 0, 1, '5 of 5', 5, 0, [['opening range','setups'],['confident','emotions']]],
  [1228, '25 Nov', '03:16', 'USDJPY', '', 'Long', '1.8', '155.386', '155.600', '+$234.95', '+0.13%', '+1.10R', '22m 53s', 'Trend pullback', 1, 0, 1, '5 of 5', 4, 1, [['pullback','setups']]],
  [1227, '24 Nov', '15:21', 'MNQ', 'Dec 26', 'Long', '3', '25,180.25', '25,196.50', '+$93.60', '+0.06%', '+0.98R', '9m 12s', 'Session momentum', 1, 0, 0, '6 of 6', 3, 1, [['calm','emotions']]],
  [1232, '24 Nov', '14:12', 'EURUSD', '', 'Long', '2', '1.15390', '1.15655', '+$511.14', '+0.22%', '+1.02R', '18h 40m', 'Session momentum', 2, 0, 3, '6 of 6', 4, 1, [['trend continuation','setups'],['calm','emotions']]],
  [1226, '24 Nov', '11:14', 'TSLA', '385 Call', 'Long', '2', '4.10', '3.38', '−$145.30', '−17.72%', '−1.45R', '38m 20s', 'Trend pullback', 2, 1, 2, '1 broken', 2, 1, [['early exit','mistake'],['pullback','setups']]],
  [1225, '24 Nov', '10:05', 'NVDA', '', 'Long', '60', '182.40', '181.95', '−$28.30', '−0.26%', '−0.31R', '14m 02s', 'Trend pullback', 1, 0, 0, '5 of 5', 3, 0, [['pullback','setups']]],
  [1224, '24 Nov', '09:44', 'NQ', 'Dec 26', 'Short', '1', '22,431.25', '22,424.50', '+$129.80', '+0.03%', '+0.72R', '21m 59s', 'Level reversal', 1, 0, 1, '7 of 7', 0, 0, [['reversal','setups']]],
  [1223, '23 Nov', '14:40', 'GBPUSD', '', 'Short', '1.5', '1.31840', '1.31905', '−$97.50', '−0.05%', '−0.65R', '31m 10s', 'Level reversal', 2, 1, 1, '1 broken', 1, 1, [['fomo entry','mistake'],['anxious','emotions']]],
  [1222, '23 Nov', '10:11', 'ES', 'Dec 26', 'Long', '1', '6,596.50', '6,601.75', '+$257.30', '+0.08%', '+1.72R', '49m 42s', 'Opening range breakout', 1, 0, 0, '5 of 5', 5, 1, [['opening range','setups']]],
  [1221, '23 Nov', '09:52', 'AAPL', '', 'Short', '50', '229.15', '229.80', '−$36.10', '−0.28%', '−0.44R', '18m 05s', null, 0, 0, 0, null, 0, 0, null],
  [1219, '23 Nov', '09:41', 'ES', 'Dec 26', 'Long', '3', '6,591.33', '6,599.83', '+$1,258.98', '+0.13%', '+2.10R', '22m 32s', 'Opening range breakout', 1, 0, 2, '5 of 5', 4, 0, [['opening range','setups']]],
];
var picked = window.LOG_PICKED || [];
var box = function (on) { return '<span class="cbx' + (on ? ' on' : '') + '"><i data-i="Check:bold"></i></span>'; };
var none = '<span class="none">None</span>';
var tone = function (v) { return v.charAt(0) === '+' ? 'gain' : v.charAt(0) === '−' ? 'loss' : ''; };
var stars = function (n) { if (!n) return none; var s = ''; for (var i = 1; i <= 5; i++) s += '<i data-i="Star:fill" class="' + (i <= n ? 'f' : '') + '"></i>'; return '<span class="mstars" aria-label="' + n + ' of 5">' + s + '</span>'; };
var rules = function (v) { return !v ? '<span class="none">Not graded</span>' : v.indexOf('broken') > 0 ? '<span class="rul b"><i data-i="XCircle:fill"></i>' + v + '</span>' : '<span class="rul k"><i data-i="CheckCircle:fill"></i>' + v + '</span>'; };
var tags = function (n, m) { return n ? '<span class="chip' + (m ? ' wa' : '') + '">' + n + (n > 1 ? ' tags' : ' tag') + '</span>' : none; };
var CAT = { setups: '#7E3F9E', emotions: '#CB4B8A', custom: '#636889' };
var tagcell = function (t) { if (!t[20]) return none; var f = t[20][0], rest = t[20].length - 1;
  var chip = f[1] === 'mistake' ? '<span class="chip wa">' + f[0] + '</span>' : '<span class="chip" style="background:color-mix(in srgb,' + CAT[f[1]] + ' 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,' + CAT[f[1]] + ' 38%,transparent)">' + f[0] + '</span>';
  return '<span class="tagc2">' + chip + (rest ? '<span class="chip plus">+' + rest + '</span>' : '') + '</span>'; };
var CAT = { setups: '#7E3F9E', emotions: '#CB4B8A', custom: '#636889' };
var tagcell = function (t) { if (!t[20]) return none; var f = t[20][0], rest = t[20].length - 1;
  var chip = f[1] === 'mistake' ? '<span class="chip wa">' + f[0] + '</span>' : '<span class="chip" style="background:color-mix(in srgb,' + CAT[f[1]] + ' 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,' + CAT[f[1]] + ' 38%,transparent)">' + f[0] + '</span>';
  return '<span class="tagc2">' + chip + (rest ? '<span class="chip plus">+' + rest + '</span>' : '') + '</span>'; };
document.getElementById('rows').innerHTML = R.map(function (t) {
  var on = picked.indexOf(t[0]) >= 0;
  return '<tr' + (on ? ' class="sel"' : '') + '><td class="cb">' + box(on) + '</td><td class="tm">' + t[1] + ' <b>' + t[2] + '</b></td>' +
    '<td><span class="sym"><b>' + t[3] + '</b> <span>' + t[4] + '</span></span></td><td><span class="sd">' + t[5] + '</span></td>' +
    '<td class="n">' + t[6] + '</td><td class="n">' + t[7] + '</td><td class="n">' + t[8] + '</td><td class="n f ' + tone(t[9]) + '">' + t[9] + '</td>' +
    '<td class="n ' + tone(t[10]) + '">' + t[10] + '</td><td class="n ' + tone(t[11]) + '">' + t[11] + '</td><td class="n">' + t[12] + '</td>' +
    '<td style="padding-left:10px">' + (t[13] || none) + '</td><td>' + tagcell(t) + '</td><td class="n' + (t[16] ? '' : ' cnt0') + '">' + t[16] + '</td>' +
    '<td>' + rules(t[17]) + '</td><td>' + stars(t[18]) + '</td><td><span class="rvw' + (t[19] ? ' on' : '') + '">' + (t[19] ? '<i data-i="SealCheck:fill"></i>' : '<i data-i="Seal"></i>') + '</span></td></tr>';
}).join('');
document.getElementById('prows').innerHTML = R.map(function (t) {
  var on = picked.indexOf(t[0]) >= 0;
  return '<li' + (on ? ' class="sel"' : '') + '>' + box(on) + '<a href="#"><span class="l1"><span class="sym"><b>' + t[3] + '</b> <span>' + t[4] + '</span></span><span class="tm">' + t[1] + ' ' + t[2] + '</span><b class="' + tone(t[9]) + '">' + t[9] + '</b></span>' +
    '<span class="l2"><span>' + t[5] + '</span><span>' + t[11] + '</span>' + (t[17] ? '<span>' + rules(t[17]) + '</span>' : '<span class="none">Not graded</span>') + (t[14] ? tags(t[14], t[15]) : '') +
    '<span class="cnt">' + (t[16] ? t[16] + (t[16] > 1 ? ' patterns' : ' pattern') : '<span class="none">0 patterns</span>') + '</span></span></a></li>';
}).join('');
})();
