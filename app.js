'use strict';

import {
  convertFromRaw,
  convertToRaw,
  CompositeDecorator,
  ContentState,
  Editor,
  EditorState,
  Entity,
  Modifier,
  SelectionState,
  EditorChangeType,
  RichUtils
} from 'draft-js';

import getEntityKeyForSelection from 'draft-js/lib/getEntityKeyForSelection';
import getRangesForDraftEntity from 'draft-js/lib/getRangesForDraftEntity';

import React from 'react'
import ReactDOM from 'react-dom'


class EntityEditorExample extends React.Component {
  constructor(props) {
    super(props);

    const decorator = new CompositeDecorator([{
      strategy: linkStrategy,
      component: Link,
    }]);

    this.state = {
      editorState: EditorState.createEmpty(decorator),
      linkState: {status:'disabled'},
      showingLinkEditor: false
    };

    this.focus = () => this.refs.editor.focus();
    this.onChange = (editorState) => {
      this.setState({editorState,linkState: getLinkState(editorState)});
    }
    this.toggleLinkEditor = ()=> { this.setState({showingLinkEditor: !this.state.showingLinkEditor}) }
    this.removeLink = ()=> {
      const newEditorState = removeLink(this.state.editorState, this.state.linkState)
      const newLinkState = getLinkState(newEditorState)
      this.setState({
        editorState: newEditorState,
        linkState: newLinkState,
        showingLinkEditor: false
      })
    }
    this.updateLink = (text,url)=> {
      const newEditorState = setLink(this.state.editorState, {...this.state.linkState, text, url})
      const newLinkState = getLinkState(newEditorState)
      this.setState({
        editorState: newEditorState,
        linkState: newLinkState,
        showingLinkEditor: false
      })
    }
  }

  render() {
    const s = this.state, e = s.editorState, l = s.linkState
    if (s.showingLinkEditor){
      const blocktext = e.getCurrentContent().getBlockForKey(l.blockKey).getText()
      const curlinktext = l.status === 'existinglink' ? blocktext.slice(l.linkstart,l.linkend) : blocktext.slice(l.selstart,l.selend)
      return <LinkEditor
        cancel={this.toggleLinkEditor}
        update={this.updateLink}
        remove={this.removeLink}
        linkState={l}
        text={ curlinktext }
        url={ l.entityKey ? Entity.get(l.entityKey).getData().url : '' }
      />
    }
    return <div> 
      <h2>Our amazing editor WITH LINKS OMG!</h2>
      <button onClick={this.toggleLinkEditor} className={l.status==='existinglink'?'active':'newlink'} disabled={l.status==='disabled'}>Link</button>
      <div style={styles.editor} onClick={this.focus}>
        <Editor
          editorState={e}
          onChange={this.onChange}
          placeholder="Enter some text..."
          ref="editor"
        />
      </div>
    </div>;
  }
}

const LinkEditor = React.createClass({
  getInitialState() { return {url:this.props.url || '',text:this.props.text || ''} },
  onChange(prop,e) { this.setState({[prop]:e.target.value}) },
  set() {
    this.props.update(this.state.text,this.state.url);
  },
  remove() {
    this.props.remove()
  },
  render() {
    let s = this.state, p = this.props, l = this.props.linkState
    return <div>
      <h4>Link editing</h4>
      <div>Text: <input onChange={this.onChange.bind(this,'text')} value={s.text}/></div>
      <div>Url: <input onChange={this.onChange.bind(this,'url')} value={s.url}/></div>
      <button disabled={!s.text || !s.url || (s.text === p.text && s.url === p.url )} onClick={this.set}>{l.status=='nolink' ? 'Add link' : 'Update link'}</button>
      {l.status === 'existinglink' && <button onClick={this.remove}>Remove link</button>}
      <button onClick={p.cancel}>Cancel</button>
    </div>;
  }
})

const styles = {
  root: {
    fontFamily: '\'Helvetica\', sans-serif',
    padding: 20,
    width: 600,
  },
  editor: {
    border: '1px solid #ccc',
    cursor: 'text',
    minHeight: 80,
    padding: 10,
  }
}

function getLinkState(editorState){
  let sel = editorState.getSelection();
  let blockKey = sel.getStartKey();
  if (blockKey !== sel.getEndKey()){
    return {status:'disabled'};
  }
  let currentContent = editorState.getCurrentContent()
  let block = currentContent.getBlockForKey(blockKey)
  let selstart = sel.getStartOffset()
  let selend = sel.getEndOffset()
  let entityKey, range
  block.findEntityRanges(
    c => {
      let localKey = c.getEntity()
      if (localKey && Entity.get(localKey).getType() === 'LINK'){
        entityKey = localKey;
        return true;
      }
    },
    (linkstart,linkend)=> {
      if (selstart >= linkstart && selend <= linkend){
        range = {linkstart,linkend,selstart,selend,status:'existinglink',entityKey,blockKey}
      }
    }
  );
  return range || {status:'nolink',selstart,selend,blockKey}
}

function removeLink(editorState,{blockKey,linkstart,linkend}){
  let linkSelection = SelectionState.createEmpty(blockKey)
    .set('anchorOffset',linkstart)
    .set('focusOffset',linkend)
    .set('isBackward',0);
  return RichUtils.toggleLink(editorState,linkSelection,null)
}

function setLink(editorState,{blockKey,selstart,selend,linkstart,linkend,text,url}){

  console.log("State at beginning in linking func",convertToRaw(editorState.getCurrentContent()));

  const {start,end} = linkend ? {start:linkstart,end:linkend} : {start:selstart,end:selend}

  const currentContent = editorState.getCurrentContent()

  let linkSelection = SelectionState.createEmpty(blockKey)
    .set('anchorOffset', start)
    .set('focusOffset', end)
    .set('isBackward',0);

  // update the text
  const newContent = Modifier.replaceText(
    currentContent,
    linkSelection,
    text
  );
  editorState = EditorState.push(editorState,newContent,'insert-characters')

  // make new text a link
  linkSelection = linkSelection.set('focusOffset',start+text.length)
  const newEntityKey = Entity.create('LINK', 'MUTABLE', {url});
  editorState = RichUtils.toggleLink(editorState,linkSelection,newEntityKey)

  // apply the link selection to new text
  editorState = EditorState.forceSelection(editorState, linkSelection)

  console.log("Updated state from linking func",convertToRaw(editorState.getCurrentContent()));

  return editorState
}


function linkStrategy(contentBlock, callback){
  contentBlock.findEntityRanges(
    (character) => {
      const entityKey = character.getEntity();
      return entityKey && Entity.get(entityKey).getType() === 'LINK';
    },
    callback
  );
}

const Link = (props) => <a href={Entity.get(props.entityKey).getData().url}>{props.children}</a>;

function getEntityStrategy(mutability) {
  return function(contentBlock, callback) {
    contentBlock.findEntityRanges(
      (character) => {
        const entityKey = character.getEntity();
        if (entityKey === null) {
          return false;
        }
        return Entity.get(entityKey).getMutability() === mutability;
      },
      callback
    );
  };
}


ReactDOM.render(
  <div>
    <p>
So here we try out our new link functionality. Please kick the tyres for a bit, try to use it while having text seleced, or not. Note behaviour visavi existing links too!
    </p>
    <EntityEditorExample />
  </div>,
  document.getElementById('app')
);