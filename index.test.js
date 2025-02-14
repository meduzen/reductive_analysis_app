require('expect-puppeteer');
const snapshotSerializer = require('jest-serializer-xml');

const path = require('path');

jest.setTimeout(10000); // 20 second timeout for promise resolution.

var globals = {};
const verbose = true;

function log(s) {
  verbose ? console.log(s) : true;
}

var button_test = async (buttonId, conditions) => {
      log(`testing button with element ID #${buttonId}`
        + (conditions ? ` and attributes ${JSON.stringify(conditions)}` : ''));

      // Expect the element to exist
      await expect(page)
        .toMatchElement(`#${buttonId}`);

      // ... to be an <input> element
      await expect(page.evaluate(`$('#${buttonId}').prop('tagName').toLowerCase()`)).resolves
        .toMatch('input'); // is an <input> element

      // ... of type `button`
      await expect(page.evaluate(`$('#${buttonId}').attr('type')`)).resolves
      .toMatch('button');

      // ... fulfilling any {attr, value} pairwise conditions
      if (conditions) {
        for (c in conditions) {
          await expect(page.evaluate(`$('#${buttonId}').attr('${c}')`)).resolves
            .toMatch(conditions[c]); 
        }
      }
    }

describe('reductive_analysis_test_suite', () => {

  beforeAll(async () => {
    await page.goto("http://localhost:8000");

    // Import relevant webapp globals into the testing environment.
    globals.type_conf = await page.evaluate('type_conf');
    globals.meta_conf = await page.evaluate('meta_conf');
    console.log("DOM fully loaded and parsed?");
  });

  it('should run a rudimentary test on static HTML to confirm Jest works', async function() {
    await expect(page.title()).resolves.toMatch(/DCML.*/s, {timeout: 30000});
    //await expect(page).toMatch(/Primaries.*Secondaries/s, {timeout: 30000});
  });

  it('should parse conf.js without throwing an exception', async function() {
    await expect(page.evaluate('CONFIG_OK')).resolves.toBeTrue();
  });

  it('should set up all buttons with expected element IDs and attributes', async function() {

    // Helper function to test a single button
    // with a compulsory element id and any other attribute-value pairs.

    // Test programmatically generated relation buttons.
    Object.keys(globals.type_conf).forEach(async (b) =>
      button_test(`${b}relationbutton`, {'class': 'relationbutton'})
    );

    // Test programmatically generated metarelation buttons.
    Object.keys(globals.meta_conf).forEach((b) =>
      button_test(`${b}metarelationbutton`, {'class': 'metarelationbutton'})
    );

    // Test hard-wired buttons.
    button_test('undobutton');
    button_test('deselectbutton');
    button_test('deletebutton');
    button_test('relationbutton', {'class': 'relationbutton'});
    button_test('midibutton');
    button_test('midireducebutton');
    button_test('downloadbutton');
    button_test('svgdownloadbutton');
    button_test('equalizebutton');
    button_test('shadesbutton');
  });

  it('should load the example MEI', async function() {
    await expect(page).toUploadFile(
      'input[type=file]',
      path.join(__dirname, 'test_scores', 'mozart13.xml')
    );
  });

  it('should have loaded view-specific buttons', async function  () {
      button_test('reducebutton', {'class': 'reducebutton'});
      button_test('unreducebutton', {'class': 'unreducebutton'});
      button_test('rerenderbutton', {'class': 'rerenderbutton'});
      button_test('newlayerbutton', {'class': 'newlayerbutton'});
      button_test('zoominbutton', {'class': 'zoominbutton'});
      button_test('zoomoutbutton', {'class': 'zoomoutbutton'});
  });


  it('should produce a directed <graph> within <mei>', async function () {
    await page.waitForTimeout(3300);
    await expect(page.evaluate(`$(window.mei).find('graph').attr('type')`)).resolves
      .toMatch(/^directed$/);
  });

  it(`should produce a convincing <mei> object (using Jest snapshots)`, async function() {

    expect.addSnapshotSerializer(snapshotSerializer);

    var mei_to_str = await page.evaluate(`$(window.mei).children()[0].outerHTML`);

    // Prevent false positives by stripping out conversion timestamps (in case of XML->MEI).
    mei_to_str = mei_to_str.replace(/isodate="\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d"/gm, '');

    // Prevent false positives by stripping out converter-generated random IDs (in case of XML->MEI).
    mei_to_str = mei_to_str.replace(/xml:id="\w+-\d+"/gm, '');

    expect(mei_to_str).toMatchSnapshot();
  });


  it('should produce a convincing SVG (using Jest snapshots)', async function() {

    expect.addSnapshotSerializer(snapshotSerializer);

    var svg_to_str = await page.evaluate(`$('svg')[1].outerHTML`);

    // Prevent false positives by stripping out Verovio-generated random attributes.
    svg_to_str = svg_to_str.replace(/id="\w+-\d+"/gm, '');
    svg_to_str = svg_to_str.replace(/section-\d+/gm, '');

    expect(svg_to_str).toMatchSnapshot();
  });

  it('should ensure that (the very last) note IDs of the MEI and the SVG match', async function () {

    // There is probably a better way to test this.
    var mei_id = await page.evaluate(`$(window.mei).find('note').last().attr('xml:id')`);
    var svg_id = await page.evaluate(`$($('svg')[1]).find('g.note').last().attr('id')`);

    expect(mei_id).toMatch(svg_id);
  })

  it('should toggle a note, ensuring that the relevant array is updated and the note styled accordingly', async function () {

    log(`About to toggle a note`);
    var svg_first_note_id = await page.evaluate(`$($('svg')[1]).find('g.note').first().attr('id')`);
    var svg_first_note_selector = `#${svg_first_note_id}`;
    var svg_first_notehead_selector = `#${svg_first_note_id} .notehead`;

    // Simulate click on the first note.
    log('Selecting note.')
    await expect(page).toClick(svg_first_notehead_selector);

    // Confirm that the selected note has been styled accordingly.
    // (I *think* that Jest-Puppeteer does not provide async monitoring of global state,
    // so checking for DOM changes before global state seems generally prudent. This might be worth revisiting.)
    await expect(page).toMatchElement(svg_first_note_selector + `[class*="selectednote"]`);

    // Confirm that the selected note has been added to the `selected` array.
    await expect(page.evaluate(`$(selected[0]).attr('id')`)).resolves.toEqual(svg_first_note_id);

    // Simulate second click on first note (deselecting it).
    log('Deselecting note.')
    await expect(page).toClick(svg_first_notehead_selector);

    // Confirm that the selected note has been styled accordingly.
    await expect(page).toMatchElement(svg_first_note_selector + `:not([class*="selectednote"])`);

    // Confirm that the selected note has been added to the `selected` array.
    await expect(page.evaluate(`$(selected[0]).attr('id')`)).resolves.toBeFalsy();
 });


  it('should extra-toggle a note, ensuring that the relevant array is updated and the note styled accordingly', async function () {

    log(`About to extra-toggle a note`);
    var svg_first_note_id = await page.evaluate(`$($('svg')[1]).find('g.note').first().attr('id')`);
    var svg_first_note_selector = `#${svg_first_note_id}`;
    var svg_first_notehead_selector = `#${svg_first_note_id} .notehead`;

    // Simulate click on the first note.
    log('Selecting note.')
    await page.keyboard.down('Shift');
    await expect(page).toClick(svg_first_notehead_selector);
    await page.keyboard.up('Shift');

    // Confirm that the selected note has been styled accordingly.
    // (I *think* that Jest-Puppeteer does not provide async monitoring of global state,
    // so checking for DOM changes before global state seems generally prudent. This might be worth revisiting.)
    await expect(page).toMatchElement(svg_first_note_selector + `[class*="extraselectednote"]`);

    // Confirm that the selected note has been added to the `selected` array.
    await expect(page.evaluate(`$(extraselected[0]).attr('id')`)).resolves.toEqual(svg_first_note_id);

    // Simulate second click on first note (deselecting it).
    log('Deselecting note.')
    await page.keyboard.down('Shift');
    await expect(page).toClick(svg_first_notehead_selector);
    await page.keyboard.up('Shift');

    // Confirm that the selected note has been styled accordingly.
    await expect(page).toMatchElement(svg_first_note_selector + `:not([class*="extraselectednote"])`);

    // Confirm that the selected note has been added to the `selected` array.
    await expect(page.evaluate(`$(extraselected[0]).attr('id')`)).resolves.toBeFalsy();
  });

  it('should toggle a new relation between structurally unequal notes', async function () {

    // Pick the first two notes for this test.
    var primary_id = await page.evaluate(`$($('svg')[1]).find('g.note')[0].id`);
    var secondary_id = await page.evaluate(`$($('svg')[1]).find('g.note')[1].id`);

    log(`About to create relationship between primary #${primary_id} and secondary #${secondary_id}.`);

    // Simulate click on the first note.
    await page.keyboard.down('Shift');
    await expect(page).toClick(`#${primary_id} .notehead`);
    await page.keyboard.up('Shift');
    log('Selected primary note.')

    // Simulate click on the secondary note.
    await expect(page).toClick(`#${secondary_id} .notehead`);
    log('Selected secondary note.')

    // Enter arpeggio relation via the keyboard shortcut.
    await page.keyboard.press('a');
    log('Created test relation.')

    // Assert MEI nodes with respective xml:id attributes.
      // TODO: Understand why the following saner and faster alternative doesn't seem to work.
      // await expect(page.evaluate(`window.mei.querySelector('node[*|id*="${primary_id}"]')`)).resolves
      //   .toBeTruthy();
      // await expect(page.evaluate(`window.mei.querySelector('node[*|id*="${secondary_id}"]')`)).resolves
      //   .toBeTruthy();        

    await expect(page
      .evaluate(`
         Object.entries(window.mei.querySelectorAll('node'))
               .map ( x => x[1].outerHTML
                               .match(/xml:id="gn-${primary_id}"/) ? true : false )`))
      .resolves
      .toIncludeAllMembers([true]);

    await expect(page
      .evaluate(`
         Object.entries(window.mei.querySelectorAll('node'))
               .map ( x => x[1].outerHTML
                               .match(/xml:id="gn-${secondary_id}"/) ? true : false )`))
      .resolves
      .toIncludeAllMembers([true]);

    // Assert relation <arc>'s for primary and secondary notes.
    // TODO: This should likely be revisited for compliance with the TEI-derived standard.
    // See https://github.com/DCMLab/reductive_analysis_app/issues/48.
    var expected_relation_id = await page.evaluate(`$(window.mei)
      .find('arc[to="#gn-${primary_id}"][type="primary"]')
      .attr('from')
      .substring(1)`); // remove the hash prefix from the ID, for consistency.
    log(`Expecting to match the primary-node arc with relation id: #${expected_relation_id}.`);

    await expect(page.evaluate(`$(window.mei)
      .find('arc[to="#gn-${secondary_id}"][type="secondary"][from="#${expected_relation_id}"]')`)).resolves
      .toBeTruthy();
    log(`Found a matching secondary-node arc with the expected relation id: #${expected_relation_id}.`);

    // Assert that a node of type `relation` has been added to the MEI tree.
    await expect(page.evaluate(`
         window.test_relation = Object.entries(window.mei.querySelectorAll('node[type="relation"]'))
                                      .filter( x => x[1]
                                                      .outerHTML
                                                      .match(/xml:id="${expected_relation_id}"/) )[0][1]`
    ))
    .resolves
    .toBeTruthy();

    // Assert a graphic element for the relation.
    await expect(page).toMatchElement(`path#${expected_relation_id}`);

    // Assert that notes are retrievable from the test relation (`relation_get_notes`).
    await expect(page.evaluate(`
      window.test_notes = relation_get_notes(
        window.test_relation
      ).map(n => n.getAttribute('xml:id'))
    `)).resolves.toBeTruthy();

    var notes_to_test = await page.evaluate(`window.test_notes`);
    log(`Note id's returned by relation_get_notes: #${notes_to_test[0]} #${notes_to_test[1]}`);
    log(`Primary and secondary note id's to be matched by those of relation_get_notes: #${primary_id} #${secondary_id}`);

    // Assert that the notes retrieved from the relation are valid.
    expect([primary_id, secondary_id]).toIncludeAllMembers(notes_to_test);

    // Assert that primary and secondary notes are retrievable from relations (`relation_get_notes_separated`).
    await expect(page.evaluate(`
      window.test_notes_separated = relation_get_notes_separated(
        window.test_relation
      ).map(n => n[0].getAttribute('xml:id'))
    `)).resolves.toBeTruthy();

    var notes_to_test_separated = await page.evaluate(`window.test_notes_separated`);
    log(`Note id's returned by relation_get_notes_separated: #${notes_to_test_separated[0]} #${notes_to_test_separated[1]}`);
    log(`Primary and secondary note id's to be matched by those of relation_get_notes: #${primary_id} #${secondary_id}`);

    // Assert that the notes retrieved from the relation are valid.
    expect([primary_id, secondary_id]).toEqual(notes_to_test_separated);

    // Attempt to press Undo.
    await page.keyboard.press('U');
    log('Pressed Undo via keyboard shortcut.')

    // Confirm that the relation is no longer drawn.
    await expect(page.evaluate(`window.test_relation`)).resolves.toEqual({});

    // Confirm that the relation node is removed from the graph.
    await expect(page.evaluate(`
      document.querySelectorAll('path[id="${expected_relation_id}"]')[0] 
    `)).resolves.toBeNil();

    // Confirm that the relevant note nodes are removed from the graph.
    await expect(page.evaluate(`
      // Checking for any residual nodes is enough because the only possibly remaining
      // (relation) node has already been ruled out.
      window.mei.querySelector('node');  
    `)).resolves.toBeNull();

    // Confirm that the relevant arcs are removed from the graph.
    await expect(page.evaluate(`
      window.mei.querySelector('arc');
    `)).resolves.toBeNull();

  });

  it('should reduce the relation between structurally unequal notes, hiding the less important one', async function () {
    // Re-enter arpeggio relation via the keyboard shortcut.
    await page.keyboard.press('a');
    log('Re-created test relation.')

    // Find and click the reduce button

    // First we need to get the reducebutton to be shown
    var buttons_id = "view_buttons";
    await expect(page).toClick(`#${buttons_id}`);
    var reducebutton_id = "reducebutton";
    await expect(page).toClick(`#${reducebutton_id}`);

    log('Reduced the test relation.');

    // Check that the secondary note has been hidden
    var secondary_id = await page.evaluate(`$($('svg')[1]).find('g.note')[1].id`);
    await expect(page.evaluate(`
	document.querySelectorAll('g[id="${secondary_id}"]')[0].classList.contains("hidden") `
      )).resolves.toBeTruthy();

    // And also the relation
    var expected_relation_id = await page.evaluate(`$(window.mei)
      .find('arc[to="#gn-${secondary_id}"][type="secondary"]')
      .attr('from')
      .substring(1)`); // remove the hash prefix from the ID, for consistency.
    await expect(page.evaluate(`
	document.querySelectorAll('path[id="${expected_relation_id}"]')[0].classList.contains("hidden") `
      )).resolves.toBeTruthy();
  });

  it('should unreduce the relation, showing it again', async function () {
    // Find and click the unreducebutton
    var unreducebutton_id = "unreducebutton";
    await expect(page).toClick(`#${unreducebutton_id}`);

    log('Unreduced the test relation.');

    // Check that the secondary note is shown again
    var secondary_id = await page.evaluate(`$($('svg')[1]).find('g.note')[1].id`);
    await expect(page.evaluate(`
	document.querySelectorAll('g[id="${secondary_id}"]')[0].classList.contains("hidden") `
      )).resolves.toBeFalsy();

    // And also the relation
    var expected_relation_id = await page.evaluate(`$(window.mei)
      .find('arc[to="#gn-${secondary_id}"][type="secondary"]')
      .attr('from')
      .substring(1)`); // remove the hash prefix from the ID, for consistency.
    await expect(page.evaluate(`
	document.querySelectorAll('path[id="${expected_relation_id}"]')[0].classList.contains("hidden") `
      )).resolves.toBeFalsy();

    var reducebutton_id = "reducebutton";

    await expect(page).toClick(`#${reducebutton_id}`);

    log('Re-reduced the test relation.');
  });

});
