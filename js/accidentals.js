
function naturalize_notes() {
  if(!selected[0].classList.contains("note")){
    console.log("Can only naturalize notes.")
    return;
  }
  if(draw_context_of(selected[0]).layer_number == 0){
    console.log("No modifications allowed to original layer.");
    return;
  }
  var sel = selected.concat(extraselected);
  sel.forEach(naturalize_note);
  sel.forEach(toggle_selected);

}


function naturalize_note(elem) {
  let svg_accid = elem.querySelector(".accid");
  if(!svg_accid){
    console.log("No accidental to remove");
    return;
  }
  remove_accidental(svg_accid);
  svg_accid.classList.add("hidden");
  let accid_id = get_id(svg_accid);
  for(dc of draw_contexts){
    let dc_id = dc.id_prefix+ accid_id;
    let svg_dc_elem = document.getElementById(dc_id);
    if(svg_dc_elem)
      svg_dc_elem.classList.add("hidden");
  }
}


function remove_accidental(elem) {
  var note_elem = elem.parentElement;
  while(!note_elem.classList.contains("note"))
    note_elem = note_elem.parentElement;

  var mei_note_id = get_id(note_elem);
  var mei_note = get_by_id(mei, mei_note_id);

  remove_mei_accidental(mei_note);
}


function remove_mei_accidental(mei_note) {
  // TODO: Many different ways to encode accidentals
  // accid attribute
  mei_note.removeAttribute("accid");

  // accid child element
  var accid_elem = Array.from(mei_note.children).filter((e) => e.tagName == "accid");
  accid_elem.forEach((e) => mei_note.removeChild(e));
  
  //TODO: more?
}



