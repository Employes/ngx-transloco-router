import { Routes, Route, NavigationExtras, Params } from "@angular/router";
import { TranslocoService } from "@ngneat/transloco";
import { Observable, Observer, pipe } from "rxjs";
import { Location } from "@angular/common";
import {
  CacheMechanism,
  LocalizeRouterSettings,
} from "./localize-router.config";
import { Inject } from "@angular/core";
import { HttpParams } from "@angular/common/http";
import { filter, takeUntil, take } from "rxjs/operators";

const COOKIE_EXPIRY = 30; // 1 month

/**
 * Abstract class for parsing localization
 */
export abstract class LocalizeParser {
  locales: Array<string>;
  currentLang: string;
  routes: Routes;
  defaultLang: string;

  protected prefix: string | string[];
  protected escapePrefix: string;

  private _loaded: boolean = false;
  private _wildcardRoute: Route;
  private _languageRoute: Route;

  /**
   * Loader constructor
   */
  constructor(
    @Inject(TranslocoService) private translate: TranslocoService,
    @Inject(Location) private location: Location,
    @Inject(LocalizeRouterSettings)
    private settings: LocalizeRouterSettings
  ) {}

  /**
   * Load routes and fetch necessary data
   */
  abstract load(routes: Routes): Promise<any>;

  /**
   * Prepare routes to be fully usable by ngx-transloco-router
   * @param routes
   */
  /* private initRoutes(routes: Routes, prefix = '') {
    routes.forEach(route => {
      if (route.path !== '**') {
        const routeData: any = route.data = route.data || {};
        routeData.localizeRouter = {};
        routeData.localizeRouter.fullPath = `${prefix}/${route.path}`;
        if (route.children && route.children.length > 0) {
          this.initRoutes(route.children, routeData.localizeRouter.fullPath);
        }
      }
    });
  } */

  /**
   * Initialize language and routes
   */
  protected init(routes: Routes): Promise<any> {
    let selectedLanguage: string;

    // this.initRoutes(routes);
    this.routes = routes;

    if (!this.locales || !this.locales.length) {
      return Promise.resolve();
    }
    /** detect current language */
    const locationLang = this.getLocationLang();
    const browserLang = this.getBrowserLang();

    if (this.settings.defaultLangFunction) {
      this.defaultLang = this.settings.defaultLangFunction(
        this.locales,
        this._cachedLang,
        browserLang
      );
    } else {
      this.defaultLang =
        this._cachedLang ||
        this.translate.getActiveLang() ||
        browserLang ||
        this.locales[0];
    }
    selectedLanguage = locationLang || this.defaultLang;
    this.translate.setDefaultLang(this.defaultLang);

    let children: Routes = [];
    /** if set prefix is enforced */
    if (this.settings.alwaysSetPrefix) {
      const baseRoute = {
        path: "",
        redirectTo: this.defaultLang,
        pathMatch: "full",
      };

      /** extract potential wildcard route */
      const wildcardIndex = routes.findIndex(
        (route: Route) => route.path === "**"
      );
      if (wildcardIndex !== -1) {
        this._wildcardRoute = routes.splice(wildcardIndex, 1)[0];
      }
      children = this.routes.splice(0, this.routes.length, baseRoute);
    } else {
      children = [...this.routes]; // shallow copy of routes
    }

    /** exclude certain routes */
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].data && children[i].data["skipRouteLocalization"]) {
        if (this.settings.alwaysSetPrefix) {
          // add directly to routes
          this.routes.push(children[i]);
        }
        // remove from routes to translate only if doesn't have to translate `redirectTo` property
        if (
          children[i].redirectTo === undefined ||
          !children[i].data["skipRouteLocalization"]["localizeRedirectTo"]
        ) {
          children.splice(i, 1);
        }
      }
    }

    /** append children routes */
    if (children && children.length) {
      if (this.locales.length > 1 || this.settings.alwaysSetPrefix) {
        this._languageRoute = { children: children };
        this.routes.unshift(this._languageRoute);
      }
    }

    /** ...and potential wildcard route */
    if (this._wildcardRoute && this.settings.alwaysSetPrefix) {
      this.routes.push(this._wildcardRoute);
    }

    /** translate routes */
    const res = this.translateRoutes(selectedLanguage);
    return res.toPromise();
  }

  initChildRoutes(routes: Routes) {
    this._translateRouteTree(routes);
    return routes;
  }

  /**
   * Translate routes to selected language
   */
  translateRoutes(language: string): Observable<any> {
    return new Observable<any>((observer: Observer<any>) => {
      this._cachedLang = language;
      if (this._languageRoute) {
        this._languageRoute.path = language;
      }

      const scopedLanguage =
        (this.settings.scope?.length ? this.settings.scope + "/" : "") +
        language;
      this.translate
        .load(scopedLanguage)
        .pipe(take(1))
        .subscribe(() => {
          this._loaded = true;
          this.currentLang = language;

          if (this._languageRoute) {
            if (this._languageRoute) {
              this._translateRouteTree(this._languageRoute.children);
            }
            // if there is wildcard route
            if (this._wildcardRoute && this._wildcardRoute.redirectTo) {
              this._translateProperty(this._wildcardRoute, "redirectTo", true);
            }
          } else {
            this._translateRouteTree(this.routes);
          }

          observer.next(void 0);
          observer.complete();
        });
    });
  }

  /**
   * Translate the route node and recursively call for all it's children
   */
  private _translateRouteTree(routes: Routes): void {
    routes.forEach((route: Route) => {
      const skipRouteLocalization =
        route.data && route.data["skipRouteLocalization"];
      const localizeRedirection =
        !skipRouteLocalization || skipRouteLocalization["localizeRedirectTo"];

      if (route.redirectTo && localizeRedirection) {
        this._translateProperty(
          route,
          "redirectTo",
          !route.redirectTo.indexOf("/")
        );
      }

      if (!skipRouteLocalization) {
        if (
          route.path !== null &&
          route.path !== undefined /* && route.path !== '**'*/
        ) {
          this._translateProperty(route, "path");
        }
        if (route.children) {
          this._translateRouteTree(route.children);
        }
        if (route.loadChildren && (<any>route)._loadedConfig) {
          this._translateRouteTree((<any>route)._loadedConfig.routes);
        }
      }
    });
  }

  /**
   * Translate property
   * If first time translation then add original to route data object
   */
  private _translateProperty(
    route: Route,
    property: string,
    prefixLang?: boolean
  ): void {
    // set property to data if not there yet
    const routeData: any = (route.data = route.data || {});
    if (!routeData.localizeRouter) {
      routeData.localizeRouter = {};
    }
    if (!routeData.localizeRouter[property]) {
      routeData.localizeRouter[property] = (<any>route)[property];
    }

    const result = this.translateRoute(routeData.localizeRouter[property]);
    (<any>route)[property] = prefixLang ? this.addPrefixToUrl(result) : result;
  }

  get urlPrefix() {
    if (
      this.settings.alwaysSetPrefix ||
      this.currentLang !== this.defaultLang
    ) {
      return this.currentLang ? this.currentLang : this.defaultLang;
    } else {
      return "";
    }
  }

  /**
   * Add current lang as prefix to given url.
   */
  addPrefixToUrl(url: string): string {
    const plitedUrl = url.split("?");
    plitedUrl[0] = plitedUrl[0].replace(/\/$/, "");
    return `/${this.urlPrefix}${plitedUrl.join("?")}`;
  }

  /**
   * Translate route and return observable
   */
  translateRoute(path: string): string {
    const queryParts = path.split("?");
    if (queryParts.length > 2) {
      throw Error("There should be only one query parameter block in the URL");
    }
    const pathSegments = queryParts[0].split("/");

    /** collect observables  */
    return (
      pathSegments
        .map((part: string) => (part.length ? this.translateText(part) : part))
        .join("/") + (queryParts.length > 1 ? `?${queryParts[1]}` : "")
    );
  }

  /**
   * Get language from url
   */
  getLocationLang(url?: string): string {
    const queryParamSplit = (url || this.location.path()).split("?");
    let pathSlices: string[] = [];
    if (queryParamSplit.length > 0) {
      pathSlices = queryParamSplit[0].split("/");
    }
    if (pathSlices.length > 1 && this.locales.indexOf(pathSlices[1]) !== -1) {
      return pathSlices[1];
    }
    if (pathSlices.length && this.locales.indexOf(pathSlices[0]) !== -1) {
      return pathSlices[0];
    }
    return null;
  }

  public getBrowserLang(): string {
    if (
      typeof window === "undefined" ||
      typeof window.navigator === "undefined"
    ) {
      return undefined;
    }

    let browserLang: any = window.navigator.languages
      ? window.navigator.languages[0]
      : null;
    browserLang =
      browserLang ||
      window.navigator.language ||
      (window.navigator as any).browserLanguage ||
      (window.navigator as any).userLanguage;

    if (typeof browserLang === "undefined") {
      return undefined;
    }

    if (browserLang.indexOf("-") !== -1) {
      browserLang = browserLang.split("-")[0];
    }

    if (browserLang.indexOf("_") !== -1) {
      browserLang = browserLang.split("_")[0];
    }

    return browserLang;
  }

  /**
   * Get language from local storage or cookie
   */
  private get _cachedLang(): string {
    if (!this.settings.useCachedLang) {
      return;
    }
    if (this.settings.cacheMechanism === CacheMechanism.LocalStorage) {
      return this._cacheWithLocalStorage();
    }
    if (this.settings.cacheMechanism === CacheMechanism.Cookie) {
      return this._cacheWithCookies();
    }
  }

  /**
   * Save language to local storage or cookie
   */
  private set _cachedLang(value: string) {
    if (!this.settings.useCachedLang) {
      return;
    }
    if (this.settings.cacheMechanism === CacheMechanism.LocalStorage) {
      this._cacheWithLocalStorage(value);
    }
    if (this.settings.cacheMechanism === CacheMechanism.Cookie) {
      this._cacheWithCookies(value);
    }
  }

  /**
   * Cache value to local storage
   */
  private _cacheWithLocalStorage(value?: string): string {
    try {
      if (
        typeof window === "undefined" ||
        typeof window.localStorage === "undefined"
      ) {
        return;
      }
      if (value) {
        window.localStorage.setItem(this.settings.cacheName, value);
        return;
      }
      return this._returnIfInLocales(
        window.localStorage.getItem(this.settings.cacheName)
      );
    } catch (e) {
      // weird Safari issue in private mode, where LocalStorage is defined but throws error on access
      return;
    }
  }

  /**
   * Cache value via cookies
   */
  private _cacheWithCookies(value?: string): string {
    try {
      if (
        typeof document === "undefined" ||
        typeof document.cookie === "undefined"
      ) {
        return;
      }
      const name = encodeURIComponent(this.settings.cacheName);
      if (value) {
        let cookieTemplate = `${this.settings.cookieFormat}`;
        cookieTemplate = cookieTemplate
          .replace("{{value}}", `${name}=${encodeURIComponent(value)}`)
          .replace(/{{expires:?(\d+)?}}/g, (fullMatch, groupMatch) => {
            const days =
              groupMatch === undefined
                ? COOKIE_EXPIRY
                : parseInt(groupMatch, 10);
            const date: Date = new Date();
            date.setTime(date.getTime() + days * 86400000);
            return `expires=${date.toUTCString()}`;
          });

        document.cookie = cookieTemplate;
        return;
      }
      const regexp = new RegExp(
        "(?:^" + name + "|;\\s*" + name + ")=(.*?)(?:;|$)",
        "g"
      );
      const result = regexp.exec(document.cookie);
      return decodeURIComponent(result[1]);
    } catch (e) {
      return; // should not happen but better safe than sorry (can happen by using domino)
    }
  }

  /**
   * Check if value exists in locales list
   */
  private _returnIfInLocales(value: string): string {
    if (value && this.locales.indexOf(value) !== -1) {
      return value;
    }
    return null;
  }

  /**
   * Search translated value by prefix('s)
   */
  private translateText(key: string): string {
    if (this.escapePrefix && key.startsWith(this.escapePrefix)) {
      return key.replace(this.escapePrefix, "");
    } else {
      if (!this._loaded) {
        return key;
      }

      if (key.startsWith(":") || key.startsWith("http") || key === "**") {
        return key;
      }

      let prefixes: string | string[] = this.prefix;
      if (!Array.isArray(prefixes)) {
        prefixes = [prefixes];
      }

      let fullKey;
      let res;
      let keyWithScope = this.settings.scope?.length ? this.settings.scope : "";

      for (let prefix of prefixes) {
        fullKey = prefix + key;
        keyWithScope = `${keyWithScope}.${fullKey}`;
        res = this.translate.translate(fullKey, {}, this.settings.scope);

        if (res.length && res !== keyWithScope) {
          break;
        }
      }

      return res.length && keyWithScope && res !== keyWithScope ? res : key;
    }
  }

  /**
   * Strategy to choose between new or old queryParams
   * @param newExtras extras that containes new QueryParams
   * @param currentQueryParams current query params
   */
  public chooseQueryParams(
    newExtras: NavigationExtras,
    currentQueryParams: Params
  ) {
    let queryParamsObj: Params;
    if (newExtras && newExtras.queryParams) {
      queryParamsObj = newExtras.queryParams;
    } else if (currentQueryParams) {
      queryParamsObj = currentQueryParams;
    }
    return queryParamsObj;
  }

  /**
   * Format query params from object to string.
   * Exemple of result: `param=value&param2=value2`
   * @param params query params object
   */
  public formatQueryParams(params: Params): string {
    return new HttpParams({ fromObject: params }).toString();
  }

  /**
   * Get translation key prefix from config
   */
  public getPrefix(): string | string[] {
    return this.prefix;
  }

  /**
   * Get escape translation prefix from config
   */
  public getEscapePrefix(): string {
    return this.escapePrefix;
  }
}

/**
 * Manually set configuration
 */
export class ManualParserLoader extends LocalizeParser {
  /**
   * CTOR
   */
  constructor(
    translate: TranslocoService,
    location: Location,
    settings: LocalizeRouterSettings,
    locales: string[] = ["en"],
    prefix: string | string[] = "ROUTES.",
    escapePrefix: string = ""
  ) {
    super(translate, location, settings);
    this.locales = locales;
    this.prefix = prefix || "";
    this.escapePrefix = escapePrefix || "";
  }

  /**
   * Initialize or append routes
   */
  load(routes: Routes): Promise<any> {
    return new Promise((resolve: any) => {
      this.init(routes).then(resolve);
    });
  }
}

export class DummyLocalizeParser extends LocalizeParser {
  load(routes: Routes): Promise<any> {
    return new Promise((resolve: any) => {
      this.init(routes).then(resolve);
    });
  }
}
