import EventEmitter from 'eventemitter3';
import Epub, { Contents, Rendition } from 'epubjs';
import { RenditionOptions, Location } from 'epubjs/types/rendition';

export interface Point2D {
  x: number;
  y: number;
}

export interface TouchEvent {
  start: Point2D;
  end: Point2D;
  moved: boolean;
}

export interface RelocatedEventPayload {
  location: Location;
  chapter?: string;
}

export interface ContentEventPayload {
  contents: Contents;
  view: Rendition;
}

export class EpubViewerBase extends EventEmitter {
  protected element!: Element;
  protected rendition!: Rendition;
  protected currentLocation!: string;
  protected currentChapter?: string;
  constructor(protected readonly book = Epub()) {
    super();
  }

  destroy() {
    this.book.destroy();
  }

  public get size() {
    return {
      width: this.element?.clientWidth,
      height: this.element?.clientHeight,
    };
  }

  public async initialize(input: ArrayBuffer) {
    await this.book.open(input, 'binary');
    await this.book.ready;
    await this.book.loaded.navigation;
  }

  public display(element: Element, options?: RenditionOptions, target?: string) {
    this.element = element;
    this.rendition = this.book.renderTo(element, {
      width: '100%',
      height: '100%',
      ...options,
      allowScriptedContent: true,
    });
    this.registerEventListeners();
    this.registerThemes();
    return this.rendition.display(target);
  }

  public goTo(target: string) {
    console.log(target);
    this.rendition.display(target);
  }

  protected registerEventListeners() {
    // rendition events
    this.rendition.on('relocated', (location: Location) => {
      this.currentLocation = location.end.cfi;
      this.currentChapter = this.getChapter(location.start.href);
      this.emit('relocated', {
        location,
        chapter: this.currentChapter,
      } as RelocatedEventPayload);
    });
    this.rendition.hooks.content.register((contents: Contents, view: Rendition) => {
      this.emit('content', contents.document);
    });
    this.rendition.hooks.render.register((iframeView: { document: any }) => {
      this.emit('render', iframeView.document);
    });
    // gestures events
    this.listenRenditionGestureEvents();
  }

  protected getChapter(href: string, toc = this.book.navigation.toc): string | undefined {
    for (const item of toc) {
      const chapter = item?.label.trim();
      if (item.href.includes(href)) {
        return chapter;
      } else if (item.subitems?.length) {
        const subChapter = this.getChapter(href, item.subitems);
        if (subChapter) {
          return `${chapter} - ${subChapter}`;
        }
      }
    }
    return undefined;
  }

  protected registerThemes() {
    this.rendition.themes.register('dark', {
      body: {
        color: 'white',
        'font-size': 'x-large',
        'padding-top': '0 !important',
        'padding-bottom': '0 !important',
      },
    });
    this.rendition.themes.register('light', {
      body: {
        color: 'black',
        'font-size': 'x-large',
        'padding-top': '0 !important',
        'padding-bottom': '0 !important',
      },
    });
    this.rendition.themes.select('light');
    // this.rendition.themes.register('lamp-reader', 'themse/lamp-reader.css');
    // this.rendition.themes.select('lamp-reader');
  }

  private handleEvent(event: TouchEvent) {
    if (!event.moved) {
      return 'tap';
    } else if (event.end.x < event.start.x) {
      // swiped left!
      return 'swipe:left';
    } else if (event.end.x > event.start.x) {
      // swiped right!
      return 'swipe:right';
    }
  }

  private listenRenditionGestureEvents() {
    const touchEvent = {
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      moved: false,
    };

    this.rendition.on('touchstart', (event: any) => {
      touchEvent.moved = false;
      touchEvent.start.x = event.changedTouches[0].screenX;
      touchEvent.start.y = event.changedTouches[0].screenY;
    });

    this.rendition.on('touchmove', () => {
      touchEvent.moved = true;
    });

    this.rendition.on('touchend', (event: any) => {
      touchEvent.end.x = event.changedTouches[0].screenX;
      touchEvent.end.y = event.changedTouches[0].screenY;
      const gesture = this.handleEvent(touchEvent);
      this.rendition.emit(gesture);
    });
  }
}
