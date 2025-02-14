// GLOBALS
// Load Verovio
var vrvToolkit;
// And the underlying MEI
var mei;
// And the graph node in the MEI
var mei_graph;
// And the MIDI
var midi;
var orig_midi;
// This is the MEI as text (pre-parse)
var data;
// We need a reader
var reader = new FileReader();
var filename;
// Did we change the MEI somehow?
var changes = false;
// Our undo stack. TODO: is this being empty the same as
// changes being false?
var undo_actions = [];

var redo_actions = []; //TODO, maybe?

// Each draw context contains information relevant to drawing
// into one of the SVG renders. In particular, we store
//  * The <div> element containing the SVG
//  * The outer <div> element that also contains the view-specific buttons
//  and controls
//  * The amount of zoom (should be moved to style?)
//  * The stack of local reduce actions
//  * The layer context to which this view belongs
//  * The prefix used for the element IDs in the SVG (compared
//    to the MEI)
// The first element is the latest
var draw_contexts = [];

// Each layer context contains information relevant to the layer, such as
//  * The rendered MEI
//  * The score element in the original MEI
//  * The <div> element containing the layer
//  * A mapping from each element in the layer score element to its
//  canonical representative
var layer_contexts = [];

//  Bookmarks.
var bookmarks = [];

// A tooltip for displaying relationship and meta-relationship types.
var tooltip;

// Prevent unsaved data loss by warning user before browser unload events (reload, close).
// Attempting to do this in compliant fashion (https://html.spec.whatwg.org/#prompt-to-unload-a-document).
window.addEventListener("beforeunload", function (e) {
  var confirmationMessage = "Leave app? You may lose unsaved changes.";

  e.preventDefault();
  e.returnValue = confirmationMessage;
  return confirmationMessage;   // Some browsers don't follow the standard and require this.
});

// Once things are loaded, do configuration stuff
$(document).ready(function() {
  document.getElementsByTagName('html')[0].classList.remove('loader');
  Object.keys(type_conf).forEach(init_type);
  Object.keys(meta_conf).forEach(meta_type);
  Object.keys(combo_conf).forEach(combo_type);
  toggle_shades();
  $("#player").midiPlayer({ color: "grey", width: 250 });
  $("#selected_things").hide();

  $("#hull_controller").on('change', handle_hull_controller);
  handle_relations_panel(document.getElementById("relations_panel"));
  minimap();
  initialize_panel();
  initialize_select_controls();
});


// Catch-all exception handler.
window.onerror = function errorHandler(errorMsg, url, lineNumber) {
  document.getElementsByTagName('html')[0].classList.remove('loader');
  alert(`An error occured: ${errorMsg}
 Please report the relevant console log as a GitHub issue.
 The app will try to continue running nonetheless.`);
  return false;
}

// OK we've selected stuff, let's make the selection into a
// "relation".
function do_relation(type, id, redoing=false) {
  console.debug("Using globals: selected, extraselected, mei, undo_actions");
  if (selected.length == 0 && extraselected == 0) {
    return;}
  changes = true;
  var he_id, mei_elems;
  if(selected.concat(extraselected)[0].classList.contains("relation")){
    var types = [];
    selected.concat(extraselected).forEach((he) => {
      //TODO: move type_synonym application so that this
      //is the right type == the one from the MEI
      types.push([he.getAttribute("type"),type]);
      var id = id_or_oldid(he);
      var hes = [get_by_id(document,id)].concat(get_by_oldid(document,id));
      hes.forEach((he) => he.setAttribute("type",type));
      var mei_he = get_by_id(mei,id);
      mei_he.getElementsByTagName("label")[0].setAttribute("type",type);
      hes.forEach(toggle_shade);
    });
    update_text();
    undo_actions.push(["change relation type",types.reverse(),selected,extraselected]);
  }else if(selected.concat(extraselected)[0].classList.contains("note")){
    check_for_duplicate_relations(type, extraselected, selected);
    var added = [];
    // Add new nodes for all notes
    var primaries = extraselected.map((e) => add_mei_node_for(mei_graph,e));
    var secondaries = selected.map((e) => add_mei_node_for(mei_graph,e));
    added.push(primaries.concat(secondaries));
    [he_id,mei_elems] = add_relation(mei_graph,primaries, secondaries, type, id);
    added.push(mei_elems);
    for(var i = 0; i < draw_contexts.length; i++) {
      let g_elem =draw_relation(draw_contexts[i],mei_graph,get_by_id(mei_graph.getRootNode(), he_id));
      if(g_elem){
	added.push(g_elem); // Draw the edge
	mark_secondaries(draw_contexts[i],mei_graph,get_by_id(mei_graph.getRootNode(),he_id));
      }
    }
    undo_actions.push(["relation",added.reverse(),selected,extraselected]);
    selected.concat(extraselected).forEach(toggle_selected); // De-select
  }
  if(!redoing)
    flush_redo();
  tooltip_update();
}

function do_comborelation(type) {
  var all = selected.concat(extraselected);
  if (all.length < 3 || extraselected.length > 2) { return;} 
  all.sort((a,b) => {
    var [ax,ay] = note_coords(a);
    var [bx,by] = note_coords(b);
    return ax - bx;
  });
  var fst = all.shift();
  var snd = all.pop();
  selected = selected.filter((e) => e == fst || e == snd);
  do_relation(combo_conf[type].outer);
  
  extraselected = [fst,snd];
  selected = all;
  do_relation(combo_conf[type].total);
  tooltip_update();
}


function do_metarelation(type, id, redoing=false) {
  console.debug("Using globals:  mei_graph, selected, extraselected");
  if (selected.length == 0 && extraselected == 0) {
    return;}
  var ci = get_class_from_classlist(selected.concat(extraselected)[0]); 
  if(!(ci == "relation" || ci == "metarelation")){
    return; }
  changes = true;
  var added = [];
  var he_id,mei_elems;

  var primaries = extraselected.map((e) =>
      get_by_id(mei_graph.getRootNode(), id_or_oldid(e)));
  var secondaries = selected.map((e) =>
      get_by_id(mei_graph.getRootNode(), id_or_oldid(e)));
  var [he_id,mei_elems] = add_metarelation(mei_graph, primaries, secondaries, type, id);
  added.push(mei_elems);
  for(var i = 0; i< draw_contexts.length; i++)
    added.push(draw_metarelation(draw_contexts[i], mei_graph, get_by_id(mei_graph.getRootNode(),he_id))); // Draw the edge

  undo_actions.push(["metarelation",added,selected,extraselected]);
  selected.concat(extraselected).forEach(toggle_selected); // De-select
  tooltip_update();
  if(!redoing)
    flush_redo();
}


// Function to download data to a file
// Taken from StackOverflow answer by Kanchu at
// https://stackoverflow.com/questions/13405129/javascript-create-and-save-file
function download(data, filename, type) {
  console.debug("Using globals: document, window");
  var file = new Blob([data], {type: type});
  if (window.navigator.msSaveOrOpenBlob) // IE10+
    window.navigator.msSaveOrOpenBlob(file, filename);
  else { // Others
    var a = document.createElement("a"),
        url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);  
    }, 0); 
  }
}

// If the MEI already has a graph, we add on to that. TODO:
// Check that the graph is actually our kind of graph
function add_or_fetch_graph() {
  console.debug("Using globals: mei");
  var existing = mei.getElementsByTagName("graph");
  if(existing.length) {
    // TODO: Not just grab the first one.
    return existing[0];
  }
  var elem = mei.createElement("graph");
  elem.setAttribute("type","directed");
  mei.getElementsByTagName("body")[0].appendChild(elem);
  return elem;
}

// An option to download the MEI with the changes we've made
function save() {
  console.debug("Using globals: mei");
  var saved = new XMLSerializer().serializeToString(mei);
  download(saved, filename+".mei", "text/xml");
}
function save_orig() {
  console.debug("Using globals: mei");
  var saved = new XMLSerializer().serializeToString(mei);
  download(saved, filename+".mei", "text/xml");
}

// Download the current SVG, including graph elements
function savesvg() {
  var saved = new XMLSerializer().serializeToString($("#svg_output")[0]);
  download(saved, filename+".svg", "text/xml");
}

// Load a new MEI
function load() {
  console.debug("Using globals: selected_extraselected, upload, reader, filenmae");
  var loaderModal = new jBox('Modal',{
    id: 'loader-modal',
    title: 'Loading...',
    content: 'Please wait...',
    closeOnEsc: false,
    closeOnClick: false,
    closeButton: false
  });
  /* Cancel loading if changes are not saved? alert */
  selected = [];
  extraselected = [];
  upload = document.getElementById("fileupload");
  if(upload.files.length == 1){
    reader.onload = function (e) {
      data = reader.result;
      // TODO: Understand why this setTimeout hack is necessary for the modal to appear.
      setTimeout(() => {
        loaderModal.open();
        setTimeout(() => {
          load_finish(loaderModal);
          loaderModal.close(loaderModal);
          music_tooltip_installer();
          indicate_current_context();
        }, 1000);
      }, 1000);
    }
    reader.readAsText(upload.files[0]);
    filename = upload.files[0].name.split(".").slice(0,-1).join(".");
    if(filename == "")
      filename = upload.files[0].name;
  }else{
    loaderModal.close();
    return;
  }
}


// Draw the existing graph
function draw_graph(draw_context) {
  console.debug("Using globals: mei_graph, mei, selected, extraselected, document");
  //var mei = draw_context.mei;
  //var mei_graph = mei.getElementsByTagName("graph")[0];
  // There's a multi-stage process to get all the info we
  // need... First we get the nodes from the graph element.
  var nodes_array = Array.from(mei_graph.getElementsByTagName("node"));
  // Get the nodes representing relations
  var relations_nodes = nodes_array.filter((x) => { return x.getAttribute("type") == "relation";})
  // Get the nodes representing metarelations
  var metarelations_nodes = nodes_array.filter((x) => { return x.getAttribute("type") == "metarelation";})
    relations_nodes.forEach((g_elem) => {
      if(draw_relation(draw_context,mei_graph,g_elem))
        mark_secondaries(draw_context,mei_graph,g_elem);
    });
    metarelations_nodes.forEach((g_elem) => draw_metarelation(draw_context,mei_graph,g_elem));
}




// Do all of this when we have the MEI in memory
function load_finish(loader_modal) {
  console.debug("Using globals data, parser, mei, jquery document, document, mei_graph, midi, changes, undo_cations, redo_actions, reduce_actions, rerendered_after_action, shades");

  // Parse the original document
  parser = new DOMParser();
  try {
    mei = parser.parseFromString(data,"text/xml");
    if (mei.getElementsByTagName('parsererror').length > 0) {
      console.log('This is not a valid XML or MEI file. However it could be ABC or Humdrum, for instance')
      loader_modal.close();
    }
  } catch {
    loader_modal.close();
    $('#fileupload').val('');
  }

  vrvToolkit = new verovio.toolkit();
   if(mei.documentElement.namespaceURI != "http://www.music-encoding.org/ns/mei") {
     // We didn't get a MEI? Try if it's a musicXML
     try {
       let new_svg = vrvToolkit.renderData(data, {pageWidth: 20000,
       pageHeight: 10000, breaks: "none"});
     } catch {
       if (!new_svg) {
         console.log ('Verovio could not generate SVG from non-MEI file.');
         loader_modal.close();
         $('#fileupload').val('');
         return false;
       }
     }
     // TODO: Detect failure and bail
     data = vrvToolkit.getMEI();
     parser = new DOMParser();
     try {
       mei = parser.parseFromString(data,"text/xml");
     } catch {
       alert('Cannot parse this XML file as valid MEI.')
       loader_modal.close();
       $('#fileupload').val('');
       return false;
     }
   }else{
     mei = fix_synonyms(mei);
   }

  try {
    mei_graph = add_or_fetch_graph();
  } catch {
    alert('Cannot parse this XML file as valid MEI.')
    loader_modal.close();
    $('#fileupload').val('');
    return false;
  }
  initialize_metadata();
  // Clear the old (if any)
  draw_contexts = [];
  layer_contexts = [];
  document.getElementById("layers").innerHTML="";

  $("#hull_controller").val(200);
  draw_contexts.hullPadding = $("#hull_controller").val();

  // Segment existing layers
  var layers = Array.from(mei.getElementsByTagName("body")[0].getElementsByTagName("score"));
  for(let i in layers ){
    let score_elem = layers[i];
    let new_mei = mei_for_layer(mei, score_elem);
    let [new_data, new_svg] = render_mei(new_mei);
    if (!new_svg) {
      console.log ('Verovio could not generate SVG from MEI.');
      return false;
    }

    var layer_element = new_layer_element();
    var [view_element,svg_element] = new_view_elements(layer_element);
    svg_element.innerHTML = new_svg;
    var layer_context = {
      "mei"        : new_mei,
      "layer_elem" : layer_element,
      "layer_number": 0,
      "score_elem" : score_elem,
      "id_mapping" : get_id_pairs(score_elem),
      "original_score" : i == 0, // The first layer is assumed to be the original score
      "number_of_views": 1
    }

    layer_contexts.push(layer_context);
    var draw_context = {
                      // TODO: One draw context per existing score element
                      // already on load.
                      "mei_score" : score_elem,
                      "svg_elem" : svg_element,
                      "view_elem" : view_element,
                      "layer" : layer_context,
                      "layer_number": 0,
                      "view_number": 0,
                      "id_prefix" : "",
                      "zoom" : 1,
                      "reductions" : []};

    if(i == 0){
      midi = vrvToolkit.renderToMIDI();
      orig_midi = midi;
    }else
      draw_context.id_prefix = draw_contexts.length;
    finalize_draw_context(draw_context);
  }


  changes = false;
  undo_actions = [];
  redo_actions = []; //TODO, maybe?
  reduce_actions = [];

  rerendered_after_action = 0;

  if(!shades)
    toggle_shades();
  document.onkeypress = function(ev) {handle_keypress(ev);};
  document.onkeydown = handle_keydown;
  document.onkeyup = handle_keyup;
  document.getElementById("layers").onclick = handle_click;

  // Install drag-select controller.
  drag_selector_installer();

  return true;
}



function rerender_mei(replace_with_rests = false, draw_context = draw_contexts[0]) {
//  var mei = draw_context.mei;
  var svg_elem = draw_context.svg_elem;
  var mei2 = mei_for_layer(mei,draw_context.layer.score_elem);

  Array.from(mei2.getElementsByTagName("note")).forEach((n) => {
    let x = document.getElementById(id_in_svg(draw_context,get_id(n)));
    if(!x || x.classList.contains("hidden")){
      //TODO: this is wrong
      // 
      var paren = n.parentNode;
      // TODO: deal properly with tremolos
      // TODO
      if(replace_with_rests && !["chord","bTrem","fTrem"].includes(paren.tagName)) {
        // Add a rest
        var rest = note_to_rest(mei2,n)
        paren.insertBefore(rest,n);
      }
      paren.removeChild(n);
    }
  });
  Array.from(mei2.getElementsByTagName("chord")).forEach((x) => {
    var paren = x.parentNode;
    if(x.getElementsByTagName("note").length == 0){
      x.parentNode.removeChild(x);
    }
  });

  return mei2;

}


function create_new_layer(draw_context,sliced =false, tied=false) {
  var new_score_elem;
  if(sliced)
    new_score_elem = new_sliced_layer(draw_context, tied);
  else
    new_score_elem = new_layer(draw_context);
  let new_mei = mei_for_layer(mei, new_score_elem);
  var [new_data, new_svg] = render_mei(new_mei);
  if (!new_svg) {
    console.log ('Verovio could not generate SVG from MEI.');
    return false;
  }

  var layer_element = new_layer_element();
  var [new_view_elem,new_svg_elem] = new_view_elements(layer_element);
  new_svg_elem.innerHTML = new_svg;
  var layer_context = {
    "mei"        : new_mei,
    "layer_elem" : layer_element,
    "layer_number": layer_contexts.length,
    "score_elem" : new_score_elem,
    "id_mapping" : get_id_pairs(new_score_elem),
    "original_score" : false,
    "number_of_views": 1,
  }
  layer_contexts.push(layer_context);
  var new_draw_context = {
                    // TODO: One draw context per existing score element
                    // already on load.
                    "mei_score" : new_score_elem,
                    "svg_elem" : new_svg_elem,
                    "view_elem" : new_view_elem,
                    "layer" : layer_context,
                    "layer_number": layer_context.layer_number,
                    "view_number": 0,
                    "id_prefix" : "",
                    "zoom" : 1,
                    "reductions" : []};

  //prefix_draw_context(new_draw_context);
  new_draw_context.id_prefix = draw_contexts.length;
  finalize_draw_context(new_draw_context);
}


function finalize_draw_context(new_draw_context) {

  new_draw_context.measure_map = compute_measure_map(new_draw_context);
  draw_contexts.reverse();
  draw_contexts.push(new_draw_context);
  draw_contexts.reverse();
  add_buttons(new_draw_context)
  for (let n of new_draw_context.svg_elem.getElementsByClassName("note")) {
    n.onclick= function(ev) {toggle_selected(n,ev.shiftKey) };
  }
  for (let s of new_draw_context.svg_elem.getElementsByClassName("staff")) {
    //TODO: handle staves with no notes in them
    let [y_to_p,p_to_y] = pitch_grid(s);
    s.y_to_p = y_to_p;
    s.p_to_y = p_to_y;
  }
  draw_graph(new_draw_context);
  minimap();
}

function render_mei(mei) {
  var data = new XMLSerializer().serializeToString(sanitize_xml(mei));

  var svg = vrvToolkit.renderData(data, {
                  pageWidth: 20000,
                  pageHeight: 10000, 
                  breaks: "none"
  });
  return [data,svg];
}


function rerender(draw_context) {
  var [new_view_elem,new_svg_elem] = new_view_elements(draw_context.layer.layer_elem);
  var new_mei = rerender_mei(false, draw_context);
  var [new_data, new_svg] = render_mei(new_mei);
  if (!new_svg) {
    console.log ('Verovio could not generate SVG from MEI.');
    return false;
  }
  
  new_svg_elem.innerHTML = new_svg;
  draw_context.layer.number_of_views += 1;
  var new_draw_context = {
                    // TODO: One draw context per existing score element
                    // already on load.
                    "mei_score" : draw_context.mei_score,
                    "svg_elem" : new_svg_elem,
                    "view_elem" : new_view_elem,
                    "layer" : draw_context.layer,
                    "layer_number": draw_context.layer.layer_number,
                    "view_number": draw_context.layer.number_of_views - 1,
                    "id_prefix" : "",
                    "zoom" : 1,
                    "reductions" : []};

  new_draw_context.id_prefix = draw_contexts.length;
  prefix_ids(new_draw_context.svg_elem,new_draw_context.id_prefix);
  finalize_draw_context(new_draw_context);
}

function initialize_panel() {
  // Add shortcut tooltips to the panel buttons.

  const buttons = [
    // conf.js label    ->        <input> element id
    ["undo",                       "undobutton"],
    ["deselect_all",               "deselectbutton"],
    ["delete_all",                 "deletebutton"],
    ["add_bookmark",               "addbookmarkbutton"],
    ["show_hide_notation",         "equalizebutton"],
    ["toggle_type_shades",         "shadesbutton"],
    ["toggle_add_note",            "addnoteputton"],
    ["pan_left",                   "panleftbutton"],
    ["pan_right",                  "panrightbutton"],
    ["jump_to_next_bookmark",      "previousbookmarkbutton"],
    ["jump_to_previous_bookmark",  "nextbookmarkbutton"],
    ["jump_to_context_below",      "previouscontextbutton"],
    ["jump_to_context_above",      "nextcontextbutton"]
  ]

  buttons.forEach(b => document.getElementById(b[1]) .setAttribute('title',
    custom_conf[b[0]] || navigation_conf[b[0]] || action_conf[b[0]])
  );

  $("#custom_type").select2({
    data: arrayToSelect2(type_full_conf),
    width: '300px',
    tags: true,
    insertTag: function (data, tag) {
      data.push(tag);
    },
    placeholder: 'Select relation type',
    allowClear: true,
    matcher: matcher
  });
  $("#custom_type").val(null).trigger("change");

  $("#meta_custom_type").select2({
    data: arrayToSelect2(meta_full_conf),
    width: '300px',
    tags: true,
    insertTag: function (data, tag) {
      data.push(tag);
    },
    placeholder: 'Select metarelation type',
    allowClear: true,
    matcher: matcher
  });
  $("#meta_custom_type").val(null).trigger("change");
}

console.log("Main webapp library is loaded");
