/**
 * Example web app for Powerhouse Process (Google Sheets).
 * Paste into your Apps Script project, adjust SHEET / column layout, redeploy.
 *
 * Fixes "cannot add Customer Acquisition":
 * - This sample does NOT whitelist steps; it stores item.step exactly as sent.
 * - If you already have a script, remove or extend any step allow-list there.
 * - In Google Sheets: if the Step column has Data validation (dropdown), add
 *   "Customer Acquisition" to the allowed list, or widen/remove validation.
 *
 * Sheet row 1 headers (exact names; order can differ if you change COL):
 * id | title | description | step | status | segment | createdAt | updatedAt
 */
var SHEET_NAME = 'Sheet1'; // or null to use first sheet
var COL = {
  id: 1,
  title: 2,
  description: 3,
  step: 4,
  status: 5,
  segment: 6,
  createdAt: 7,
  updatedAt: 8,
};

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
}

function rowToItem_(row) {
  return {
    id: String(row[COL.id - 1] || ''),
    title: String(row[COL.title - 1] || ''),
    description: String(row[COL.description - 1] || ''),
    step: String(row[COL.step - 1] || ''),
    status: String(row[COL.status - 1] || ''),
    segment: String(row[COL.segment - 1] || ''),
    createdAt: String(row[COL.createdAt - 1] || ''),
    updatedAt: String(row[COL.updatedAt - 1] || ''),
  };
}

function listItems_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last, 8).getValues();
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var id = rows[i][COL.id - 1];
    if (id) items.push(rowToItem_(rows[i]));
  }
  return items;
}

function findRowById_(id) {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, COL.id, last, COL.id).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return 2 + i;
  }
  return 0;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'list') {
      return jsonOut_({ ok: true, items: listItems_() });
    }
    return jsonOut_({ ok: false, error: 'Unknown or missing action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'create') {
      var item = body.item;
      if (!item || !item.id || !item.title) {
        return jsonOut_({ ok: false, error: 'Missing item.id or item.title' });
      }
      var now = new Date().toISOString();
      var row = [
        item.id,
        item.title,
        item.description || '',
        item.step || '',
        item.status || '',
        item.segment || '',
        now,
        now,
      ];
      getSheet_().appendRow(row);
      return jsonOut_({
        ok: true,
        item: {
          id: item.id,
          title: item.title,
          description: item.description || '',
          step: item.step || '',
          status: item.status || '',
          segment: item.segment || '',
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    if (action === 'update') {
      var u = body.item;
      if (!u || !u.id) return jsonOut_({ ok: false, error: 'Missing item.id' });
      var r = findRowById_(u.id);
      if (!r) return jsonOut_({ ok: false, error: 'Row not found for id' });
      var nowU = new Date().toISOString();
      var shU = getSheet_();
      shU.getRange(r, COL.title).setValue(u.title || '');
      shU.getRange(r, COL.description).setValue(u.description || '');
      shU.getRange(r, COL.step).setValue(u.step || '');
      shU.getRange(r, COL.status).setValue(u.status || '');
      shU.getRange(r, COL.segment).setValue(u.segment || '');
      shU.getRange(r, COL.updatedAt).setValue(nowU);
      var created = shU.getRange(r, COL.createdAt).getValue();
      return jsonOut_({
        ok: true,
        item: {
          id: u.id,
          title: u.title,
          description: u.description || '',
          step: u.step || '',
          status: u.status || '',
          segment: u.segment || '',
          createdAt: String(created || ''),
          updatedAt: nowU,
        },
      });
    }

    if (action === 'delete') {
      var delId = body.id;
      if (!delId) return jsonOut_({ ok: false, error: 'Missing id' });
      var rd = findRowById_(delId);
      if (!rd) return jsonOut_({ ok: false, error: 'Row not found' });
      getSheet_().deleteRow(rd);
      return jsonOut_({ ok: true, deleted: true });
    }

    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err2) {
    return jsonOut_({ ok: false, error: String(err2.message || err2) });
  }
}
