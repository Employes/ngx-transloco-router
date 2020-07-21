# ngx-transloco-router

> An implementation of routes localization for Angular.

[![npm version](https://badge.fury.io/js/%40employes%2Fngx-transloco-router.svg)](https://badge.fury.io/js/%40employes%2Fngx-transloco-router) ![Build & Publish](https://github.com/Employes/ngx-transloco-router/workflows/Build%20&%20Publish/badge.svg)

**Fork of [@gilsdav/ngx-translate-router](https://github.com/gilsdav/ngx-translate-router).**

**Version to choose :**

| angular version | transloco-router | type   |
| --------------- | ---------------- | ------ |
| 8 - 10          | 1.0.0            | active |

> This documentation is for version 1.x.x which requires Angular 9+. If you are migrating from the older version follow [migration guide](https://github.com/Greentube/localize-router/blob/master/MIGRATION_GUIDE.md) to upgrade to latest version.

# Table of contents:

- [Installation](#installation)
- [Usage](#usage)
  - [Initialize module](#initialize-module)
    - [Http loader](#http-loader)
    - [Manual initialization](#manual-initialization)
    - [Initialization config](#initialization-config)
  - [How it works](#how-it-works)
    - [Excluding routes](#excluding-routes)
    - [Path discrimination](#path-discrimination)
    - [WildCard path](#wildcard-path)
    - [Matcher params translation](#matcher-params-translation)
  - [Pipe](#pipe)
  - [Service](#service)
  - [AOT](#aot)
- [API](#api)
  - [LocalizeRouterModule](#localizeroutermodule)
  - [LocalizeRouterConfig](#localizerouterconfig)
  - [LocalizeRouterService](#localizerouterservice)
  - [LocalizeParser](#localizeparser)
- [License](#license)

## Installation

```
npm install --save @employes/ngx-transloco-router
```

## Usage

In order to use `@employes/ngx-transloco-router` you must initialize it with following information:

- Available languages/locales
- Prefix for route segment translations
- Routes to be translated

### Initialize module

`import {LocalizeRouterModule} from '@employes/ngx-transloco-router';`
Module can be initialized either using static file or manually by passing necessary values.

_Be careful to import this module after the standard RouterModule and the TranslateModule. This should be done for the main router as well as for lazy loaded ones._

```ts
imports: [
  TranslocoModule,
  RouterModule.forRoot(routes),
  LocalizeRouterModule.forRoot(routes),
];
```

#### Manual initialization

With manual initialization you need to provide information directly:

```ts
LocalizeRouterModule.forRoot(routes, {
    parser: {
        provide: LocalizeParser,
        useFactory: (translate, location, settings) =>
            new ManualParserLoader(translate, location, settings, ['en', 'de', ...], ['prefix', 'routes', ...]),
        deps: [TranslateService, Location, LocalizeRouterSettings]
    }
})
```

#### Initialization config

Apart from providing routes which are mandatory, and parser loader you can provide additional configuration for more granular setting of `@employes/ngx-transloco-router`. More information at [LocalizeRouterConfig](#localizerouterconfig).

### How it works

`@employes/ngx-transloco-router` intercepts Router initialization and translates each `path` and `redirectTo` path of Routes.
The translation process is done with [@ngneat/transloco](https://github.com/ngneat/transloco). In order to separate
router translations from normal application translations we use `prefix`. Default value for prefix is `ROUTES.`. Finally, in order to avoid accidentally translating a URL segment that should not be translated, you can optionally use `escapePrefix` so the prefix gets stripped and the segment doesn't get translated. Default `escapePrefix` is unset.

```
'home' -> 'ROUTES.home'
```

Example to escape the translation of the segment with `escapePrefix: '!'`

```
'!segment' -> 'segment'
```

```
{ path: '!home/first' ... } -> '/fr/home/premier'
```

Upon every route change `@employes/ngx-transloco-router` kicks in to check if there was a change to language. Translated routes are prepended with two letter language code:

```
http://yourpath/home -> http://yourpath/en/home
```

If no language is provided in the url path, application uses:

- cached language in LocalStorage (browser only) or
- current language of the browser (browser only) or
- first locale in the config

Make sure you therefore place most common language (e.g. 'en') as a first string in the array of locales.

> Note that `ngx-transloco-router` does not redirect routes like `my/route` to translated ones e.g. `en/my/route`. All routes are prepended by currently selected language so route without language is unknown to Router.

#### Excluding routes

Sometimes you might have a need to have certain routes excluded from the localization process e.g. login page, registration page etc. This is possible by setting flag `skipRouteLocalization` on route's data object.

In case you want to redirect to an url when skipRouteLocalization is activated, you can also provide config option `localizeRedirectTo` to skip route localization but localize redirect to. Otherwise, route and redirectTo will not be translated.

```ts
let routes = [
  // this route gets localized
  { path: 'home', component: HomeComponent },
  // this route will not be localized
  { path: 'login', component: LoginComponent, data: { skipRouteLocalization: true } }
    // this route will not be localized, but redirect to will do
  { path: 'logout', redirectTo: 'login', data: { skipRouteLocalization: { localizeRedirectTo: true } } }
];
```

Note that this flag should only be set on root routes. By excluding root route, all its sub routes are automatically excluded.
Setting this flag on sub route has no effect as parent route would already have or have not language prefix.

#### Path discrimination

Do you use same path to load multiple lazy-loaded modules and you have wrong component tree ?
`discriminantPathKey` will help ngx-transloco-router to generate good component tree.

```ts
  {
    path: '',
    loadChildren: () => import('app/home/home.module').then(m => m.HomeModule),
    data: {
        discriminantPathKey: 'HOMEPATH'
    }
  },
  {
    path: '',
    loadChildren: () => import('app/information/information.module').then(m => m.InformationModule),
    data: {
        discriminantPathKey: 'INFOPATH'
    }
  }
```

#### WildCard Path

##### Favored way

The favored way to use WildCard ( `'**'` path ) is to use the `redirectTo`. It will let the user to translate the "not found" page message.

```ts
{
  path: '404',
  component: NotFoundComponent
},
{
  path: '**',
  redirectTo: '/404'
}
```

##### Alternative

If you need to keep the wrong url you will face to a limitation: **_You can not translate current page._**
This limitation is because we can not determine the language from a wrong url.

```ts
{
  path: '**',
  component: NotFoundComponent
}
```

### Pipe

`LocalizeRouterPipe` is used to translate `routerLink` directive's content. Pipe can be appended to partial strings in the routerLink's definition or to entire array element:

```html
<a [routerLink]="['user', userId, 'profile'] | localize"
  >{{'USER_PROFILE' | translate}}</a
>
<a [routerLink]="['about' | localize]">{{'ABOUT' | translate}}</a>
```

Root routes work the same way with addition that in case of root links, link is prepended by language.
Example for german language and link to 'about':

```
'/about' | localize -> '/de/über'
```

### Service

Routes can be manually translated using `LocalizeRouterService`. This is important if you want to use `router.navigate` for dynamical routes.

```ts
class MyComponent {
  constructor(private localize: LocalizeRouterService) {}

  myMethod() {
    let translatedPath: any = this.localize.translateRoute("about/me");

    // do something with translated path
    // e.g. this.router.navigate([translatedPath]);
  }
}
```

### AOT

In order to use Ahead-Of-Time compilation any custom loaders must be exported as functions.
This is the implementation currently in the solution:

```ts
export function localizeLoaderFactory(
  translate: TranslateService,
  location: Location,
  http: Http
) {
  return new StaticParserLoader(translate, location, http);
}
```

## API

### LocalizeRouterModule

#### Methods:

- `forRoot(routes: Routes, config: LocalizeRouterConfig = {}): ModuleWithProviders`: Main initializer for @employes/ngx-transloco-router. Can provide custom configuration for more granular settings.
- `forChild(routes: Routes): ModuleWithProviders`: Child module initializer for providing child routes.

### LocalizeRouterConfig

#### Properties

- `parser`: Provider for loading of LocalizeParser. Default value is `StaticParserLoader`.
- `useCachedLang`: boolean. Flag whether default language should be cached. Default value is `true`.
- `alwaysSetPrefix`: boolean. Flag whether language should always prefix the url. Default value is `true`.  
  When value is `false`, prefix will not be used for for default language (this includes the situation when there is only one language).
- `cacheMechanism`: CacheMechanism.LocalStorage || CacheMechanism.Cookie. Default value is `CacheMechanism.LocalStorage`.
- `cacheName`: string. Name of cookie/local store. Default value is `LOCALIZE_DEFAULT_LANGUAGE`.
- `defaultLangFunction`: (languages: string[], cachedLang?: string, browserLang?: string) => string. Override method for custom logic for picking default language, when no language is provided via url. Default value is `undefined`.
- `cookieFormat`: string. Format of cookie to store. Default value is `'{{value}};{{expires}}'`. (Extended format e.g : `'{{value}};{{expires}};path=/'`)
  - `{{value}}` will be replaced by the value to save (`CACHE_NAME=language`). Must be present into format.
  - `{{expires}}` will be replaced by `expires=currentDate+30days`. Optional if you want session cookie.
    - you can configure the number of expiration days by using this synthax: `{{expires:365}}`. It will result as `expires=currentDate+365days`.
  - results to : `LOCALIZE_DEFAULT_LANGUAGE=en;expires=Wed, 11 Sep 2019 21:19:23 GMT`.

### LocalizeRouterService

#### Properties:

- `routerEvents`: An EventEmitter to listen to language change event

```ts
localizeService.routerEvents.subscribe((language: string) => {
  // do something with language
});
```

- `parser`: Used instance of LocalizeParser

```ts
let selectedLanguage = localizeService.parser.currentLang;
```

#### Methods:

- `translateRoute(path: string | any[]): string | any[]`: Translates given path. If `path` starts with backslash then path is prepended with currently set language.

```ts
localizeService.translateRoute("/"); // -> e.g. '/en'
localizeService.translateRoute("/about"); // -> '/de/ueber-uns' (e.g. for German language)
localizeService.translateRoute("about"); // -> 'ueber-uns' (e.g. for German language)
```

- `changeLanguage(lang: string, extras?: NavigationExtras, useNavigateMethod?: boolean)`: Translates current url to given language and changes the application's language.
  `extras` will be passed down to Angular Router navigation methods.
  `userNavigateMethod` tells localize-router to use `navigate` rather than `navigateByUrl` method.  
  For german language and route defined as `:lang/users/:user_name/profile`

```
yoursite.com/en/users/John%20Doe/profile -> yoursite.com/de/benutzer/John%20Doe/profil
```

### LocalizeParser

#### Properties:

- `locales`: Array of used language codes
- `currentLang`: Currently selected language
- `routes`: Active translated routes
- `urlPrefix`: Language prefix for current language. Empty string if `alwaysSetPrefix=false` and `currentLang` is same as default language.

#### Methods:

- `translateRoutes(language: string): Observable<any>`: Translates all the routes and sets language and current
  language across the application.
- `translateRoute(path: string): string`: Translates single path
- `getLocationLang(url?: string): string`: Extracts language from current url if matching defined locales

## License

Licensed under MIT
