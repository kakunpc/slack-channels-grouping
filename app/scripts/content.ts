// modules
import * as $ from 'jquery';
import * as EventEmitter from 'eventemitter3';

// constants
const CHANNEL_LIST_SELECTOR = '.p-channel_sidebar__static_list';
const CHANNEL_LIST_ITEMS_SELECTOR = CHANNEL_LIST_SELECTOR + ' [role=listitem]';
const CHANNEL_NAME_SELECTOR = '.p-channel_sidebar__name';
const CHANNEL_NAME_ROOT = '-/';

// types
type RequestIdleCallbackHandle = number;
type RequestIdleCallbackOptions = {
  timeout: number;
};
type RequestIdleCallbackDeadline = {
  readonly didTimeout: boolean;
  timeRemaining: (() => number);
};

declare global {
  interface Window {
    requestIdleCallback: ((
      callback: ((deadline: RequestIdleCallbackDeadline) => void),
      opts?: RequestIdleCallbackOptions,
    ) => RequestIdleCallbackHandle);
    cancelIdleCallback: ((handle: RequestIdleCallbackHandle) => void);
  }
}

/**
 * Channel Observing Class
 * @extends EventEmitter
 */
class ChannelObserver extends EventEmitter<'update'> {
  private observer: MutationObserver;
  private isObserving: boolean;

  constructor() {
    super();
    this.observer = null;
    this.isObserving = false;
  }

  async start(): Promise<void> {
    await this.waitRenderChannelList();
    this.emit('update');
    this.enableObserver();

    document.addEventListener('visibilitychange', () => {
      switch (document.visibilityState) {
        case 'visible':
          this.emit('update');
          this.enableObserver();
          break;
        case 'hidden':
          this.disableObserver();
          break;
      }
    });
  }

  protected waitRenderChannelList(): Promise<null> {
    return new Promise((resolve): void => {
      const loopStartTime = Date.now();

      const checkChannelListLoop = (): void => {
        if (document.querySelectorAll(CHANNEL_LIST_ITEMS_SELECTOR).length > 0) {
          resolve();
          return;
        }

        // timeout 30 seconds
        if (Date.now() - loopStartTime > 1000 * 30) {
          resolve();
          return;
        }

        setTimeout(checkChannelListLoop, 100);
      };

      checkChannelListLoop();
    });
  }

  enableObserver(): void {
    if (this.isObserving) {
      return;
    }
    if (!this.observer) {
      this.observer = new MutationObserver((): void => {
        this.emit('update');
      });
    }

    const observeTarget = document.querySelector(CHANNEL_LIST_SELECTOR);
    if (!observeTarget) {
      return;
    }
    this.observer.observe(observeTarget, {
      childList: true,
    });
    this.isObserving = true;
  }

  disableObserver(): void {
    if (!this.isObserving) {
      return;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.isObserving = false;
    }
  }
}

/**
 * Channel Grouping Class
 */
class ChannelGrouper {
  groupingAllByPrefixOnIdle(): void {
    window.requestIdleCallback(() => {
      this.groupingAllByPrefix();
    }, {
      timeout: 10 * 1000
    });
  }

  groupingAllByPrefix(): void {
    const $channelItems = $(CHANNEL_LIST_ITEMS_SELECTOR);

    if ($channelItems.length === 0) {
      return;
    }

    const prefixes: string[] = this.getPrefixes($channelItems);
    this.preprocessForRootChannels($channelItems, prefixes);
    this.applyGrouing($channelItems, prefixes);
  }

  protected getPrefixes($channelItems: JQuery): string[] {
    const regChannelMatch = /(^.+?)[-_].*/;
    const prefixes: string[] = [];

    $channelItems.each(function (index: number, channelItem: HTMLElement) {
      const $channelName = $(channelItem).find(CHANNEL_NAME_SELECTOR);
      const isApplied = $channelName.find('span').length > 0;
      let channelName = '';
      let prefix = '';

      // Get ch name
      if (isApplied && $channelName.data('scg-channel-name')) {
        channelName = $channelName.data('scg-channel-name');
      } else {
        channelName = $.trim($channelName.text());
        // Store raw channel name
        $channelName.data('scg-raw-channel-name', channelName);
      }

      // Get ch name prefix
      if (isApplied && $channelName.data('scg-channel-prefix')) {
        prefix = $channelName.data('scg-channel-prefix');
      } else {
        if (regChannelMatch.test(channelName)) {
          prefix = channelName.match(regChannelMatch)[1];
        } else {
          prefix = '';
        }
      }

      $channelName.data('scg-channel-name', channelName);
      $channelName.data('scg-channel-prefix', prefix);
      prefixes[index] = prefix;
    });

    return prefixes;
  }

  protected preprocessForRootChannels($channelItems: JQuery, prefixes: string[]): void {
    $channelItems.each(function (index: number, channelItem: HTMLElement) {
      const $channelName = $(channelItem).find(CHANNEL_NAME_SELECTOR);
      const channelName: string = $channelName.data('scg-channel-name');
      const isRoot = prefixes[index + 1] === channelName;

      if (isRoot) {
        prefixes[index] = channelName;
        $channelName.data('scg-channel-name', `${channelName}${CHANNEL_NAME_ROOT}`);
        $channelName.data('scg-channel-prefix', channelName);
      }
    });
  }

  protected applyGrouing($channelItems: JQuery, prefixes: string[]): void {
    $channelItems.each((index: number, channelItem: HTMLElement) => {
      const $channelName = $(channelItem).find(CHANNEL_NAME_SELECTOR);
      const prefix: string = prefixes[index];
      const isLoneliness = prefixes[index - 1] !== prefix && prefixes[index + 1] !== prefix;
      const isParent = prefixes[index - 1] !== prefix && prefixes[index + 1] === prefix;

      // Skip blank item
      if ($channelName.length === 0) {
        return;
      }

      // Skip no prefix
      if (prefixes[index] === '') {
        return;
      }

      if (isLoneliness) {
        $channelName
          .removeClass('scg-ch-parent scg-ch-child')
          .text($channelName.data('scg-raw-channel-name'));
      } else {
        const empty = $channelName
          .removeClass('scg-ch-parent scg-ch-child')
          //.addClass(isParent ? 'scg-ch-parent' : 'scg-ch-child')
          .addClass('scg-ch-child')
          .empty();

        let isStar = $channelName.parents().attr('data-qa-channel-sidebar-is-starred');
        if (isStar == null) isStar = 'false';
        const starPrefix = (isStar === 'true' ? '_isStar' : '_noStar');
        if (isParent && $('div[id="' + prefix + starPrefix + '"]').length == 0) {
          const InsertPartition = '<div id="' + prefix + starPrefix + '" role="presentation" style="height: 26px;" class="open">' +
            '<a class="c-link p-channel_sidebar__channel">' +
            '<i class="c-icon c-icon--caret-down c-icon--inherit c-icon--inline" type="channel-pane-hash" aria-hidden="true"></i>' +
            '<span class="scg-ch-prefix">' + prefix + '</span>';
          '</a>' +
            '</div>';
          empty.parent().parent().before(InsertPartition);
          const head = $('div[id="' + prefix + starPrefix + '"]');
          head.on('click', () => {
            head.toggleClass('open');
            const isOpen = head.hasClass('open');

            if (isOpen) {
              head.find('i').removeClass('c-icon--caret-right');
              head.find('i').addClass('c-icon--caret-down');
            }
            else {
              head.find('i').removeClass('c-icon--caret-down');
              head.find('i').addClass('c-icon--caret-right');
            }

            this.UpdateChannnels(prefix + starPrefix, isOpen);
          });
        }

        empty
          //.append($('<span>').addClass('scg-ch-prefix').text(prefix))
          .append($('<span>').addClass('scg-ch-prefix').text('　'))
          //.append($('<span>').addClass('scg-ch-separator').text(separator))
          .append($('<span>').addClass('scg-ch-name').text($channelName.data('scg-channel-name').replace(/(^.+?)[-_](.*)/, '$2')))
          .attr('id', prefix + starPrefix);

        empty.parent().css('visibility', 'visible');
        empty.parent().parent().css('height', '26px');

      }
    });
  }

  protected UpdateChannnels($prefix: string, $isOpen: boolean): void {
    const channels = $('span[id="' + $prefix + '"]');
    channels.each(function (index: number, channelItem: HTMLElement) {
      if ($isOpen) {
        $(channelItem).parent().css('visibility', 'visible');
        $(channelItem).parent().parent().css('height', '26px');
      }
      else {
        $(channelItem).parent().css('visibility', 'hidden');
        $(channelItem).parent().parent().css('height', '0px');
      }
    });
  }
}


((): void => {
  const channelObserver = new ChannelObserver();
  const channelGrouper = new ChannelGrouper();
  channelObserver.on('update', () => {
    channelGrouper.groupingAllByPrefixOnIdle();
  });
  channelObserver.start();
})();
