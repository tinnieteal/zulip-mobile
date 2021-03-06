/* @flow strict-local */
import React, { PureComponent } from 'react';

import * as api from '../api';
import type { Auth, Dispatch, Message } from '../types';
import { Screen } from '../common';
import SearchMessagesCard from './SearchMessagesCard';
import styles from '../styles';
import { SEARCH_NARROW } from '../utils/narrow';
import { LAST_MESSAGE_ANCHOR } from '../anchor';
import { connect } from '../react-redux';
import { getAuth } from '../account/accountsSelectors';

type Props = $ReadOnly<{|
  auth: Auth,
  dispatch: Dispatch,
  // Warning: do not add new props without considering their effect on the
  // behavior of this component's non-React internal state. See comment below.
|}>;

type State = {|
  /** The list of messages returned for the latest query, or `null` if there is
   *  effectively no "latest query" to have results from.
   */
  messages: Message[] | null,
  /** Whether there is currently an active valid network request. */
  isFetching: boolean,
|};

class SearchMessagesScreen extends PureComponent<Props, State> {
  state = {
    messages: null,
    isFetching: false,
  };

  /** PRIVATE
   *  Performs a network request associated with a query. Does not
   *  update or access internal state (except `auth`).
   */
  performQueryRaw = async (query: string): Promise<Message[]> => {
    const { auth } = this.props;
    const { messages } = await api.getMessages(
      auth,
      SEARCH_NARROW(query),
      LAST_MESSAGE_ANCHOR,
      20,
      0,
      false,
    );
    return messages;
  };

  // Non-React state. See comment following.
  lastIdSent: number = 1000;
  lastIdReceived: number = 1000;

  // This component is less pure than it should be. The correct behavior here is
  // probably that, when props change, all outstanding asynchronous requests
  // should be **synchronously** invalidated before the next render.
  //
  // As the only React prop this component has is `auth`, we ignore this for
  // now: any updates to `auth` would involve this screen being torn down and
  // reconstructed anyway. However, addition of any new props which need to
  // invalidate outstanding requests on change will require more work.

  handleQueryChange = (query: string) => {
    const id = ++this.lastIdSent;

    if (query === '') {
      // The empty query can be resolved without a network call.
      this.lastIdReceived = id;
      this.setState({ messages: null, isFetching: false });
      return;
    }

    this.setState({ isFetching: true });
    this.handleQueryChangeInner(id, query);
  };

  handleQueryChangeInner = async (id: number, query: string) => {
    let messages: Message[];
    {
      // if the promise's construction fails, we let the exception
      // propagate immediately
      const networkPromise = this.performQueryRaw(query);

      try {
        messages = await networkPromise;
      } finally {
        /* Succeed or fail, we update our request-state. We discard late
           results _even if they are errors_. */
        if (this.lastIdReceived > id) {
          // eslint-disable-next-line no-unsafe-finally
          return;
        }
        this.lastIdReceived = id;
      }
      /* TODO: if an error makes it through the filter above,
         should we arrange to display something to the user? */
    }
    // N.B.: `messages` is now set

    // A query is concluded. Report the message-list.
    this.setState({
      messages,
      isFetching: this.lastIdSent !== this.lastIdReceived,
    });
  };

  render() {
    const { messages, isFetching } = this.state;

    return (
      <Screen search autoFocus searchBarOnChange={this.handleQueryChange} style={styles.flexed}>
        <SearchMessagesCard messages={messages} isFetching={isFetching} />
      </Screen>
    );
  }
}

export default connect(state => ({
  auth: getAuth(state),
}))(SearchMessagesScreen);
