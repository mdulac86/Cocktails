
(function () {
  /* [famille, articles, type] — sp : spiritueux, li : liqueurs, vins et amers, mx : mélangeurs */
  var GROUPS = window.COCKTAIL_DATA.groups;
  var LABEL = Object.create(null);
  GROUPS.forEach(function (g) { g[1].forEach(function (p) { LABEL[p[0]] = p[1]; }); });
  function short(id) { return (LABEL[id] || id).replace(/ \(.*\)$/, "").replace(/ ou .*$/, "").toLowerCase(); }

  var SUB = {}; // No silent flavour-changing substitutions.
  var C = window.COCKTAIL_DATA.recipes;

  /* Force estimée : alcool pur divisé par le volume final, dilution comprise. */
  function strengthOf(c) {
    var volume=0, alcohol=0;
    c[10].ingredients.forEach(function(i){
      var ml=i[1] || (/trait/.test(i[2]) ? (/2 traits/.test(i[2]) ? 1.6 : .8) : /lime.*(?:press|morceau)/.test(i[2]) ? 20 : /blanc.*œuf|œuf.*blanc/.test(i[2]) ? 25 : 0);
      volume+=ml; alcohol+=ml*i[3]/100;
    });
    // Dilution is a service assumption, not a measured final ABV.
    var dilution=c[10].method === 'Agité' ? 25 : c[10].method === 'Remué' ? 20 : c[10].method === 'Au mélangeur' ? 80 : /Mimosa/.test(c[0]) ? 0 : 15;
    var pct=volume ? Math.round(100*alcohol/(volume+dilution)) : 0;
    return {k:pct<9?'f':pct<18?'m':'x',pct:pct,std:Math.round(alcohol/17.05*10)/10};
  }
  var STRL = { f: "Faible", m: "Moyen", x: "Fort" };
  C.forEach(function (c) { var r = strengthOf(c); c[7] = r.k; c[8] = r.pct; c[9] = String(r.std).replace(".", ","); });
  var have = new Set();
  var brands = [];
  var ratings = Object.create(null);
  var unit = "ml", servings = 1;
 var chosenVariants = {}, shopping = [], recent = [];
  var ui = { profile:"all", access:"all", variants:false, tab: "bar", level: 0, avail: "all", mine: "all", str: "all", q: "", limit: 40 };
  var env = { base: "", level: 1, str: "all", newOnly: true, allowOne: false, queue: [], pos: 0, wrapped: false };
  var STORE_KEY = "bar-cocktails-v1";
  var dbDoc = null, saveTimer = null, saving = false, dirty = false;

  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  function met(req) {
    return req.split("|").some(function (id) {
      return have.has(id) || (SUB[id] || []).some(function (s) { return have.has(s); });
    });
  }
  function missing(c) {
    return c[3].filter(function (r) { return !met(r); }).map(function (r) {
      return r.split("|").map(short).join(" ou ");
    });
  }

 function effective(c) {
   var v=c[10].variant;
   if (!v || !chosenVariants[c[0]]) return c;
   var d=c.slice();d[1]=v.level;d[6]="";d[3]=v.requirements;d[5]=v.steps;
   d[10]=Object.assign({},c[10],{ingredients:v.ingredients,source:null,status:"Variante maison",access:"Courses courantes",levelReason:v.level===1?"Au verre, ingrédients courants, sans préparation spéciale.":"Un geste de plus ou quelques ingrédients à prévoir.",note:"",variantName:v.name});
   d[4]=v.ingredients.map(function(i){return i[2]});
   var s=strengthOf(d);d[7]=s.k;d[8]=s.pct;d[9]=String(s.std).replace('.',',');return d;
 }
 function candidate(c,i) {
   var d=effective(c);
   if(ui.variants && chosenVariants[c[0]]===undefined && c[10].variant && missing(d).length && !missing({3:c[10].variant.requirements}).length) {
     chosenVariants[c[0]]=true; d=effective(c);
   }
   return {c:d,i:i,m:missing(d)};
 }

  function counts() {
    var ok = 0, one = 0;
    C.forEach(function (c) { var m = missing(c).length; if (m === 0) ok++; else if (m === 1) one++; });
    return { ok: ok, one: one };
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }

  /* Marques connues : le nom tapé choisit la catégorie */
  var BRANDS = [
    ["Kepler", "gin_aromatise"], ["Sortilège", "sortilege"], ["Southern Comfort", "southern_comfort"], ["Galliano", "galliano"], ["Sambuca", "sambuca"], ["Jägermeister", "jagermeister"], ["Pastis 51", "pastis"], ["Ricard", "pastis"], ["Cherry Heering", "liqueur_cerise"], ["Cidre de glace", "cidre_glace"], ["Domaine Pinnacle", "cidre_glace"], ["Cassis de l’Île d’Orléans", "creme_cassis"], ["Fireball", "fireball"], ["Kraken", "rhum_epice"], ["Captain Morgan épicé", "rhum_epice"],
    ["Captain Morgan blanc", "rhum_blanc"], ["Sailor Jerry", "rhum_epice"], ["Bumbu", "rhum_ambre"], ["Bacardi", "rhum_blanc"],
    ["Malibu", "rhum_coco"], ["Appleton Estate", "rhum_brun"], ["Diplomático", "rhum_brun"], ["Mount Gay", "rhum_brun"],
    ["Lamb’s Navy", "rhum_noir"], ["Gosling’s Black Seal", "goslings"], ["Clément", "rhum_agricole"], ["JM", "rhum_agricole"],
    ["Patrón Añejo", "tequila_anejo"], ["Patrón Reposado", "tequila_reposado"], ["Patrón Silver", "tequila"], ["Don Julio Blanco", "tequila"],
    ["Don Julio Reposado", "tequila_reposado"], ["Don Julio Añejo", "tequila_anejo"], ["Jose Cuervo", "tequila"], ["Espolòn", "tequila"],
    ["Casamigos Blanco", "tequila"], ["Casamigos Reposado", "tequila_reposado"], ["Casamigos Añejo", "tequila_anejo"],
    ["Absolut", "vodka"], ["Absolut Citron", "vodka_citron"], ["Smirnoff", "vodka"], ["Grey Goose", "vodka"], ["Belvedere", "vodka"],
    ["Ketel One", "vodka"], ["Tito’s", "vodka"],
    ["Bombay Sapphire", "gin"], ["Tanqueray", "gin"], ["Hendrick’s", "gin"], ["Beefeater", "gin"], ["Gordon’s", "gin"],
    ["Jack Daniel’s", "bourbon"], ["Jim Beam", "bourbon"], ["Maker’s Mark", "bourbon"], ["Wild Turkey", "bourbon"], ["Buffalo Trace", "bourbon"],
    ["Crown Royal", "canadien"], ["Wiser’s", "canadien"], ["Canadian Club", "canadien"],
    ["Johnnie Walker", "scotch"], ["Chivas Regal", "scotch"], ["Glenfiddich", "single_malt"], ["Macallan", "single_malt"],
    ["Laphroaig", "scotch_tourbe"], ["Lagavulin", "scotch_tourbe"], ["Ardbeg", "scotch_tourbe"],
    ["Jameson", "irlandais"], ["Bushmills", "irlandais"],
    ["Hennessy", "cognac"], ["Rémy Martin", "cognac"], ["Courvoisier", "cognac"],
    ["Cointreau", "triple_sec"], ["Grand Marnier", "triple_sec"], ["Kahlúa", "kahlua"], ["Baileys", "baileys"], ["Disaronno", "amaretto"],
    ["Campari", "campari"], ["Aperol", "aperol"], ["Midori", "midori"], ["St-Germain", "st_germain"], ["Chambord", "chambord"],
    ["Frangelico", "frangelico"], ["Drambuie", "drambuie"], ["Limoncello", "limoncello"], ["Pimm’s", "pimms"], ["Fernet-Branca", "fernet"],
    ["Chartreuse", "chartreuse"], ["Martini Rosso", "vermouth_doux"], ["Martini Extra Dry", "vermouth_sec"], ["Cinzano Rosso", "vermouth_doux"],
    ["Noilly Prat", "vermouth_sec"], ["Lillet", "lillet"], ["Averna", "amaro"], ["Montenegro", "amaro"], ["Bénédictine", "benedictine"]
  ];
  function guess(name) {
    var n = norm(name), best = "", len = 0;
    if (n.length < 3) return "";
    BRANDS.forEach(function (b) {
      var k = norm(b[0]);
      if ((n.indexOf(k) > -1 || (n.length >= 4 && k.indexOf(n) > -1)) && k.length > len) { best = b[1]; len = k.length; }
    });
    return best;
  }

  /* Persistance : db privé si disponible, sinon stockage du navigateur */
  function snapshot() { return { version:3, have:Array.from(have), brands:brands, ratings:ratings, shopping:shopping, recent:recent }; }
  function lsGet() { try { var v = localStorage.getItem(STORE_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {} }
  function applySaved(o) {
    if (!o) return;
    var arr = Array.isArray(o) ? o : (Array.isArray(o.have) ? o.have : []);
    have = new Set(arr.filter(function (i) { return LABEL[i]; }));
    var bs = (!Array.isArray(o) && Array.isArray(o.brands)) ? o.brands : [];
    brands = bs.filter(function (b) { return b && typeof b.n === "string" && LABEL[b.id]; }).slice(0, 200);
    var rt = (!Array.isArray(o) && o.ratings && typeof o.ratings === "object") ? o.ratings : {};
    shopping = Array.isArray(o.shopping) ? o.shopping.filter(function(i){return typeof i === "string" && LABEL[i];}).slice(0,200) : [];
    recent = Array.isArray(o.recent) ? o.recent.filter(function(i){return typeof i === "string";}).slice(-30) : [];
    ratings = Object.create(null);
    Object.keys(rt).slice(0, 2000).forEach(function (k) {
      var v = rt[k];
      if (v && typeof v === "object") ratings[k] = {
        s: Math.max(0, Math.min(5, v.s | 0)), n: typeof v.n === "string" ? v.n.slice(0, 500) : "",
        m: Math.max(0, Math.min(999, v.m | 0)), d: typeof v.d === "string" ? v.d.slice(0, 10) : ""
      };
    });
  }
  function queueSave() {
    lsSet(snapshot());
    if (!dbDoc) return;
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }
  function flush() {
    if (saving || !dbDoc || !dirty) return;
    saving = true; dirty = false;
    dbDoc.set(snapshot()).catch(function () {}).then(function () {
      saving = false;
      if (dirty) flush();
    });
  }

  var GUIDE = [
    ['mesurer','Mesurer · doseur / jigger','Matériel','Le doseur mesure les petits volumes avec précision. Verse jusqu’au repère à hauteur des yeux. Une cuillère à mesurer de cuisine peut dépanner : 1 c. à thé = 5 ml, 1 c. à soupe = 15 ml. Dans cette appli, 1 oz US = 29,57 ml. Une once n’est pas un verre.'],
    ['shaker','Shaker · agiter / shake','Techniques','Verse les ingrédients non gazeux dans le shaker, ajoute beaucoup de glaçons, ferme et tiens les deux parties. Agite vivement environ 10 à 15 secondes, puis filtre. Le but : refroidir, mélanger, diluer et aérer. Utile avec jus, crème ou œuf. Ne secoue jamais une boisson gazeuse ni un liquide chaud dans un contenant fermé.'],
    ['remuer','Remuer · stir','Techniques','Verse les ingrédients et des glaçons dans un verre à mélange. Fais circuler doucement la cuillère autour de la paroi pendant environ 20 à 30 secondes; goûte pour juger le froid et la dilution, puis filtre. Idéal pour Manhattan ou Martini : texture lisse, peu de bulles. Un grand verre et une longue cuillère suffisent.'],
    ['au-verre','Monter au verre · build','Techniques','Prépare directement dans le verre de service : glaçons, ingrédients mesurés, puis boisson gazeuse. Remue délicatement une ou deux fois. C’est la méthode idéale pour improviser un highball.'],
    ['filtrer','Filtrer · strain','Techniques','Une passoire à cocktail retient les glaçons du shaker ou du verre à mélange. Verse dans le verre de service, sur de nouveaux glaçons si la recette le demande. Le filtre intégré d’un shaker trois pièces convient aussi.'],
    ['double-filtrer','Double-filtrer · fine strain','Techniques','Verse à travers la passoire du shaker puis une petite passoire fine tenue au-dessus du verre. Elle retient pépins, fragments d’herbes et petits éclats de glace. Utile avec les fruits écrasés; une passoire fine de cuisine fait l’affaire.'],
    ['piler','Piler · muddle','Techniques','Presse doucement fruits ou herbes au fond du récipient. Pour la menthe, quelques pressions légères suffisent : la réduire en bouillie donne un goût végétal. Pour des fruits fermes, presse davantage. Le bout arrondi d’une cuillère en bois peut remplacer le pilon.'],
    ['dry-shake','Dry shake · agiter sans glace','Techniques','Pour faire mousser un blanc d’œuf, agite d’abord les ingrédients sans glace, puis ajoute des glaçons et agite de nouveau pour refroidir. Utilise du blanc pasteurisé si tu choisis cette option. Le blanc apporte une texture, pas du sucre; l’omettre donne une autre texture. Jamais de bulles au shaker.'],
    ['allonger','Allonger · top up','Vocabulaire','Ajouter le mélangeur indiqué après la base : eau gazeuse, tonic, jus… Verse la quantité donnée. « Compléter » ne veut pas dire remplir n’importe quel verre jusqu’en haut : un verre immense rendrait le cocktail trop faible.'],
    ['flotter','Faire flotter · float','Techniques','Verse doucement un petit volume sur le dos d’une cuillère près de la surface. Il reste partiellement en couche sur le dessus. Exemple : scotch tourbé du Penicillin. Le nez sera plus marqué et la première gorgée différente.'],
    ['rincer','Rincer le verre · rinse','Techniques','Verse une très petite quantité de liqueur ou d’absinthe, fais tourner le verre pour tapisser la paroi, puis retire l’excédent. Le rinçage parfume sans ajouter une pleine mesure.'],
    ['zeste','Exprimer un zeste · twist','Techniques','Prélève une bande de peau d’agrume avec peu de blanc. Pince-la au-dessus du verre, côté coloré tourné vers le cocktail, pour projeter les huiles aromatiques. Frotte éventuellement le rebord, puis dépose le zeste. Pas besoin de le flamber.'],
    ['givrer','Givrer le rebord · rim','Techniques','Humidifie légèrement la moitié du bord avec un quartier d’agrume, puis pose ce côté dans du sel ou du sucre sur une assiette. Garde l’intérieur du verre propre. Un demi-rebord permet de choisir chaque gorgée.'],
    ['trait','Trait / dash et goutte','Vocabulaire','Un trait est une petite projection du flacon d’amers; une goutte est plus petite. Le volume dépend du bouchon. Pour les estimations seulement, l’appli prend environ 0,8 ml par trait. N’utilise pas une cuillère entière à la place.'],
    ['cuillere','Cuillère de bar · barspoon','Matériel','Longue cuillère pour mélanger. Sa capacité varie; si une précision est nécessaire, utilise une cuillère à mesurer de 5 ml. Une cuillère de sucre se mesure à plat.'],
    ['glace','Glace, dilution et refroidissement','Équilibre','La fonte apporte de l’eau : elle fait partie de la recette. Utilise des glaçons fermes en quantité suffisante. De gros glaçons fondent plus lentement dans le verre; la glace concassée refroidit et dilue vite. Goûte après refroidissement avant de modifier les doses. Un cocktail moins brûlant peut quand même contenir autant d’alcool.'],
    ['service','Sur glace / on the rocks · up · straight','Vocabulaire','Sur glace : servi avec des glaçons. « Up » : refroidi puis filtré dans un verre sans glace. « Neat » : spiritueux servi sans glace ni dilution ajoutée. « Straight » est ambigu : précise ton intention. Une coupe sert souvent aux cocktails filtrés sans glace; un highball est un verre haut pour les boissons allongées.'],
    ['sour','Sour, Collins, fizz et highball','Familles','Un sour combine spiritueux, agrume et sucre. Un Collins l’allonge à l’eau gazeuse, généralement sur glace. Un fizz est aussi pétillant, avec un service propre à sa recette. Un highball associe une base et une plus grande part de mélangeur. Ces familles aident à explorer des goûts voisins.'],
    ['amer','Amers / bitters et apéritifs amers','Ingrédients','Les bitters aromatiques comme Angostura sont concentrés et souvent dosés en traits. Campari ou Aperol sont des apéritifs amers dosés en millilitres. Ils ne se remplacent pas à volumes égaux.'],
    ['vermouth','Vermouth sec et doux','Ingrédients','Vins aromatisés et fortifiés. « Sec » et « doux » ont des profils et des teneurs en sucre différents; ce ne sont pas deux noms pour la même bouteille. Réfrigère après ouverture et suis les indications du fabricant.'],
    ['sirops','Sirop simple, riche, miel et érable','Ingrédients','Simple 1:1 : 100 g de sucre + 100 g d’eau, dissoudre et refroidir. Riche 2:1 : 200 g de sucre + 100 g d’eau; plus concentré, ne pas remplacer volume pour volume. Miel 1:1 : mêmes volumes de miel et d’eau tiède. L’érable est utilisé pur quand la recette le précise. Étiquette et réfrigère tes préparations maison.'],
    ['substituer','Substituer sans perdre l’équilibre','Équilibre','Vérifie la fonction : base alcoolisée, acidité, sucre, amertume ou arôme. L’amaretto contient de l’alcool, l’orgeat est un sirop : ce n’est pas un échange direct. Le ginger ale est généralement moins piquant que la ginger beer. Utilise les variantes complètes proposées; elles expliquent les différences.'],
    ['equilibre','Ajuster un cocktail','Équilibre','Mesure, refroidis, puis goûte. Pour un sour trop acide : essaie 2,5 ml de sirop en plus par verre. Trop sucré : 2,5 ml de jus frais en plus. Trop puissant au goût : vérifie d’abord le froid et la dilution. Allonger change la concentration, pas la quantité d’alcool déjà versée. Pour réduire cette quantité, choisis une recette moins alcoolisée ou une plus petite portion.'],
    ['gazeux','Bulles : soda, tonic et ginger beer','Ingrédients','Ici, « soda » signifie eau gazeuse nature. Le tonic est sucré et amer, le cola a sa propre saveur, la ginger beer apporte du gingembre. Ils ne sont pas neutres. Ajoute-les en dernier, froids, et remue peu.'],
    ['coco','Crème de coco et crème de noix de coco','Ingrédients','Les produits sucrés pour cocktails et les crèmes non sucrées de cuisine sont très différents. Vérifie l’étiquette. Une recette de Piña Colada conçue pour une crème sucrée demandera un ajustement si ton produit ne contient pas de sucre. Ne confonds pas avec l’eau de coco.']
  ];
  function installGuide(){
    elGuide.innerHTML='<div class="guide-intro"><p class="eyebrow">LE PETIT LIVRE DU COMPTOIR</p><h2>Comprendre le geste.<br>Réussir le verre.</h2><p>Des explications courtes, du matériel simple et les bons repères pour apprendre en préparant.</p><input class="search" id="guide-search" type="search" placeholder="Un mot, une technique…" aria-label="Chercher dans le guide"></div><div id="guide-techniques" class="guide-grid">'+GUIDE.map(function(t){return '<details class="guide-entry" id="guide-'+t[0]+'"><summary><small>'+t[2]+'</small><strong>'+t[1]+'</strong></summary><p>'+t[3]+'</p></details>';}).join('')+'</div><p id="guide-empty" hidden>Aucune explication trouvée. Essaie un autre mot.</p>'+buyingGuide()+'<p class="hint2">Repères et explications rédigés pour Le Comptoir. Pour approfondir : <a href="https://www.saq.com/fr/contenu/inspiration/reportages/essentiels-bar-maison" target="_blank" rel="noopener">Les essentiels du bar maison — SAQ</a> · <a href="https://www.euvs.org/fr/tools/techniques" target="_blank" rel="noopener">Techniques — EUVS</a>.</p>';
    document.getElementById('guide-search').oninput=function(e){var q=norm(e.target.value),n=0;document.querySelectorAll('.guide-entry').forEach(function(d){d.hidden=!norm(d.textContent).includes(q);if(!d.hidden)n++;});document.getElementById('guide-empty').hidden=n>0;};
    document.addEventListener('click',function(e){var link=e.target.closest('[data-term],.guide-open');if(link){e.preventDefault();setTab('guide');var id=link.dataset.term||'shaker';var d=document.getElementById('guide-'+id);document.getElementById('guide-search').value='';document.querySelectorAll('.guide-entry').forEach(function(x){x.hidden=false;});document.getElementById('guide-empty').hidden=true;if(d){d.open=true;d.scrollIntoView({block:'center'});}}});
    document.getElementById('carnet').onclick=function(){ui.mine='fav';ui.avail='all';ui.q='';setTab('rec');};
    document.getElementById('backup').onclick=function(){download('mon-comptoir.json',JSON.stringify(snapshot(),null,2),'application/json');document.getElementById('backup-status').textContent='Sauvegarde exportée.';};
    document.getElementById('restore').onchange=async function(e){var f=e.target.files[0],status=document.getElementById('backup-status');if(!f)return;try{if(f.size>2000000)throw Error();var o=JSON.parse(await f.text());if(!o || !Array.isArray(o.have) || !o.ratings || typeof o.ratings!=='object')throw Error();download('mon-comptoir-avant-import.json',JSON.stringify(snapshot(),null,2),'application/json');applySaved(o);queueSave();refresh();status.textContent='Données importées. Une copie des données précédentes a été téléchargée.';}catch(err){status.textContent='Fichier non reconnu : choisis une sauvegarde du Comptoir. Tes données restent intactes.';}e.target.value='';};
    elRec.addEventListener('change',function(e){if(e.target.id==='profile'){ui.profile=e.target.value;fillList();}if(e.target.id==='access'){ui.access=e.target.value;fillList();}if(e.target.id==='variants'){ui.variants=e.target.checked;chosenVariants={};renderRec();}});
    document.getElementById('shopping-list').onclick=function(e){var b=e.target.closest('[data-shop-remove]');if(b){shopping=shopping.filter(function(i){return i!==b.dataset.shopRemove});queueSave();renderShopping();}if(e.target.id==='export-shopping')download('mes-courses.txt',shopping.map(function(i){return document.documentElement.lang==='en'?window.toEnglish(LABEL[i]):LABEL[i]}).join('\n'),'text/plain');};
  }
  function download(name,text,type){var url=URL.createObjectURL(new Blob([text],{type:type}));var a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000);}
  function termLinks(s){var m=s.match(/double[- ]filtrer|sans glace|agiter|shaker|remuer|filtrer|piler|écraser|compléter|allonger|flotter|zeste|givrer|rinçage/i);if(!m)return esc(s);var k=norm(m[0]);var id=/double/.test(k)?'double-filtrer':/sans glace/.test(k)?'dry-shake':/agiter|shaker/.test(k)?'shaker':/remuer/.test(k)?'remuer':/filtrer/.test(k)?'filtrer':/piler|ecraser/.test(k)?'piler':/completer|allonger/.test(k)?'allonger':/flotter/.test(k)?'flotter':/zeste/.test(k)?'zeste':/givrer/.test(k)?'givrer':'rincer';return '<span>'+esc(s)+'</span> <a class="term" href="#guide-'+id+'" data-term="'+id+'" aria-label="Comprendre ce geste">↗</a>';}
  function extraFilters(){var profiles=Array.from(new Set(C.map(function(c){return c[10].profile}))).sort();return '<div class="extra-filters"><label>Saveurs <select id="profile"><option value="all">Toutes les saveurs</option>'+profiles.map(function(p){return '<option value="'+esc(p)+'" '+(p===ui.profile?'selected':'')+'>'+esc(p)+'</option>';}).join('')+'</select></label><label>Approvisionnement <select id="access"><option value="all">Tous les ingrédients</option><option value="common" '+(ui.access==='common'?'selected':'')+'>Éviter les spécialités</option></select></label><label><input type="checkbox" id="variants" '+(ui.variants?'checked':'')+'> Proposer une variante maison si elle est réalisable</label></div>';}
  function variantControls(c,i){if(!c[10].variant)return '';var on=!!chosenVariants[c[0]];return '<div class="variant-control"><button class="pill" data-variant="original" data-index="'+i+'" aria-pressed="'+!on+'">Original</button><button class="pill" data-variant="simple" data-index="'+i+'" aria-pressed="'+on+'">Version maison accessible</button><p>'+esc(on?c[10].variant.note:'Conserve la formule originale ou découvre une variante complète avec des ingrédients plus courants.')+'</p></div>';}
  function handleExtra(e){var v=e.target.closest('[data-variant]');if(v){var i=+v.dataset.index;chosenVariants[C[i][0]]=v.dataset.variant==='simple';if(ui.tab==='rec')renderRec(C[i][0]);else{env.queue[env.pos]=candidate(C[i],i);fillEnv();}return true;}var b=e.target.closest('[data-shop]');if(b){var c=effective(C[+b.dataset.shop]);c[3].filter(function(r){return !met(r)}).forEach(function(r){var id=r.split('|')[0];if(!shopping.includes(id))shopping.push(id);});queueSave();renderShopping();b.textContent='Ajouté à mes courses';return true;}return false;}
  function renderShopping(){document.getElementById('shopping-count').textContent='('+shopping.length+')';document.getElementById('shopping-list').innerHTML=shopping.length?'<p>Liste d’ingrédients pour la version sélectionnée. Vérifie les quantités dans les recettes avant d’acheter.</p><ul>'+shopping.map(function(i){var group=GROUPS.find(function(g){return g[1].some(function(p){return p[0]===i})});return '<li>'+esc(LABEL[i])+' <small>· '+(group && group[2]!=='mx'?'SAQ / vérifier le stock':'Épicerie ou préparation maison')+'</small> <button class="pill" data-shop-remove="'+i+'" aria-label="Retirer '+esc(LABEL[i])+'">Retirer</button></li>';}).join('')+'</ul><button class="pill" id="export-shopping">Exporter la liste</button>':'<p>Aucun achat prévu. Depuis une recette, ajoute uniquement ce qui te manque.</p>';}
  function buyingGuide(){return '<div class="buying"><p class="eyebrow">PENSÉ POUR LA BEAUCE</p><h2>Un bar utile, des courses simples.</h2><p>Commence avec les bouteilles que tu aimes déjà. Quelques agrumes, du sucre pour un sirop maison et un mélangeur ouvrent plusieurs familles de cocktails. Ajoute ensuite une bouteille qui sert à plusieurs recettes, plutôt qu’un ingrédient pour un seul verre.</p><dl><dt>Épicerie habituelle</dt><dd>Citrons, limes, jus, sucre, miel, érable et boissons gazeuses sont les premières pistes. Les fruits surgelés décongelés peuvent dépanner les recettes pilées. Vérifie la composition des jus et la crème de coco.</dd><dt>Une visite à la SAQ</dt><dd>Choisis ta succursale sur le site pour vérifier les produits avant de te déplacer. <a href="https://www.saq.com/fr/store/33518" target="_blank" rel="noopener">SAQ Saint-Georges, boulevard Lacroix ↗</a>. Aucune disponibilité locale en temps réel n’est garantie dans cette appli.</dd><dt>Les spécialités</dt><dd>Chartreuse, marasquin, crème de violette, orgeat et certains rhums méritent une vérification préalable. Le filtre « Éviter les spécialités » et les variantes maison t’aident à garder les courses simples.</dd><dt>Simple ne veut pas dire tout posséder</dt><dd>« Prêt » dépend de ton inventaire, y compris jus, fruits et sirops. « Simple » décrit les gestes et les ingrédients. Une recette simple peut quand même te manquer aujourd’hui.</dd></dl></div>';}

  /* Rendu */
  var elBar = document.getElementById("view-bar"), elRec = document.getElementById("view-rec"), elEnv = document.getElementById("view-env");
  var tabBar = document.getElementById("tab-bar"), tabRec = document.getElementById("tab-rec"), tabEnv = document.getElementById("tab-env"), tabGuide=document.getElementById("tab-guide"), elGuide=document.getElementById("view-guide");

  function renderBar() {
    var html = "";
    if (have.size === 0) {
      html += '<div class="empty" style="margin-bottom:22px"><b>Ton bar est vide</b><p>Touche les bouteilles que tu possèdes, ou tape une marque ci-dessous. Les cocktails possibles s’affichent dans l’onglet Cocktails.</p><button class="pill" id="sample">Essayer avec un bar d’exemple</button></div>';
    }
    var opts = "";
    GROUPS.filter(function (g) { return g[2] !== "mx"; }).forEach(function (g) {
      opts += '<optgroup label="' + g[0] + '">';
      g[1].forEach(function (p) { opts += '<option value="' + p[0] + '">' + esc(p[1]) + '</option>'; });
      opts += '</optgroup>';
    });
    html += '<div class="finder"><h2>Ajouter une marque</h2><div class="frow">' +
      '<input id="brandIn" aria-label="Marque de bouteille" list="brandList" placeholder="Kraken, Patrón Añejo, Kepler…" autocomplete="off" maxlength="60">' +
      '<select id="brandCat" aria-label="Catégorie de la bouteille"><option value="">Catégorie…</option>' + opts + '</select>' +
      '<button class="add" id="brandAdd">Ajouter</button></div><p class="hint" id="hint"></p>';
    html += '<datalist id="brandList">' + BRANDS.map(function (b) { return '<option value="' + esc(b[0]) + '"></option>'; }).join("") + '</datalist>';
    if (brands.length) {
      html += '<div class="mybr">' + brands.map(function (b, i) {
        return '<span class="br">' + esc(b.n) + ' · ' + esc(LABEL[b.id].replace(/ \(.*\)$/, "")) + '<button data-rm="' + i + '" aria-label="Retirer ' + esc(b.n) + '">✕</button></span>';
      }).join("") + '</div>';
    }
    html += '</div>';
    GROUPS.forEach(function (g) {
      var n = g[1].filter(function (p) { return have.has(p[0]); }).length;
      html += '<div class="grp" data-group="'+esc(g[0])+'"><h2>' + g[0] + '<small>' + n + ' / ' + g[1].length + '</small></h2><div class="chips">';
      g[1].forEach(function (p) {
        html += '<button class="chip" data-id="' + p[0] + '" aria-pressed="' + have.has(p[0]) + '">' + esc(p[1]) + '</button>';
      });
      html += '</div></div>';
    });
    html += '<div class="tools"><button class="ghost" id="clear">Tout décocher</button></div>';
    elBar.innerHTML = html;
  }

  function pips(n) { return '<span class="pips" aria-hidden="true"><i class="' + (n > 0 ? "on" : "") + '"></i><i class="' + (n > 1 ? "on" : "") + '"></i><i class="' + (n > 2 ? "on" : "") + '"></i></span>'; }
  var LV = ["", "Simple", "Moyen", "Complexe"];

  function filtered() {
    var q = norm(ui.q);
    var list = C.map(candidate).filter(function (x) {
      if(ui.profile!=="all" && x.c[10].profile!==ui.profile)return false;
      if(ui.access==="common" && x.c[10].access==="À planifier")return false;
      if (ui.level && x.c[1] !== ui.level) return false;
      if (ui.str !== "all" && x.c[7] !== ui.str) return false;
      if (ui.avail === "ok" && x.m.length !== 0) return false;
      if (ui.avail === "one" && x.m.length > 1) return false;
      if (q && norm(x.c[0] + " " + x.c[4].join(" ") + " " + x.c[10].profile + " " + x.c[10].method + " " + window.toEnglish(x.c[0]+" "+x.c[4].join(" ")+" "+x.c[10].profile)).indexOf(q) === -1) return false;
      var r = ratings[x.c[0]], made = !!(r && (r.m > 0 || r.s > 0));
      if (ui.mine === "made" && !made) return false;
      if (ui.mine === "fav" && !(r && r.s >= 4)) return false;
      if (ui.mine === "new" && made) return false;
      return true;
    });
    list.sort(function (a, b) { return a.m.length - b.m.length || a.c[1] - b.c[1] || a.c[0].localeCompare(b.c[0], "fr"); });
    return list;
  }

  /* Avis */
  function ensure(name) { return ratings[name] || (ratings[name] = { s: 0, n: "", m: 0, d: "" }); }
  function mineText(r) {
    var a = [];
    if (r && r.s) a.push("★ " + r.s);
    if (r && r.m) a.push("fait " + r.m + "×");
    return a.join(" · ");
  }
  function paintRate(det, i) {
    if (!det) return;
    var r = ratings[C[i][0]] || { s: 0, m: 0 };
    det.querySelectorAll(".star").forEach(function (b) {
      var k = +b.getAttribute("data-star");
      b.classList.toggle("on", k <= r.s);
      b.setAttribute("aria-pressed", String(k === r.s));
    });
    var mine = det.querySelector(".mine"); if (mine) mine.textContent = mineText(r);
    var mc = det.querySelector(".madecount"); if (mc) mc.textContent = r.m ? "Fait " + r.m + " fois" : "";
  }
  function handleRate(e) {
    var el = e.target.closest("[data-star],[data-made]");
    if (!el) return false;
    var i = +el.getAttribute("data-i"), r = ensure(C[i][0]);
    if (el.hasAttribute("data-star")) {
      var n = +el.getAttribute("data-star");
      r.s = r.s === n ? 0 : n;
    } else {
      r.m = Math.min(999, r.m + 1);
      r.d = new Date().toISOString().slice(0, 10);
    }
    queueSave(); paintRate(el.closest("details"), i);
    return true;
  }
  function handleNote(e) {
    var el = e.target.closest("[data-note]");
    if (!el) return;
    ensure(C[+el.getAttribute("data-i")][0]).n = el.value.slice(0, 500);
    queueSave();
  }


  function drinkArt(c, hero) {
    var text = norm(c[0] + ' ' + c[4].join(' ')), glass = norm(c[2]);
    var color = /campari|aperol|grenadine|canneberge|fraise|framboise/.test(text) ? '#e37a65' : /creme|baileys|coco/.test(text) ? '#eee1bd' : /cola|cafe|kahlua/.test(text) ? '#845337' : /menthe|concombre/.test(text) ? '#b9d190' : '#e9b65e';
    var wine = /vin/.test(glass), flute = /flute/.test(glass);
    var coupe = /coupe|martini|margarita/.test(glass), low = /whisky|rocks|old fashioned|tasse/.test(glass);
    var bowl = wine ? 'M78 45 L70 105 Q70 158 120 158 Q170 158 170 105 L162 45 Z' : flute ? 'M100 30 L101 125 Q120 158 139 125 L140 30 Z' : coupe ? 'M65 65 Q120 178 175 65 Z' : low ? 'M77 90 L83 184 Q120 196 157 184 L163 90 Z' : 'M88 40 L95 185 Q120 197 145 185 L152 40 Z';
    var liquid = wine ? 'M74 90 L74 107 Q74 154 120 154 Q166 154 166 107 L166 90 Z' : flute ? 'M104 65 L105 123 Q120 151 135 123 L136 65 Z' : coupe ? 'M77 84 Q120 160 163 84 Z' : low ? 'M81 115 L86 180 Q120 190 154 180 L159 115 Z' : 'M93 78 L99 181 Q120 190 141 181 L147 78 Z';
    return '<svg viewBox="0 0 240 260" aria-hidden="true" focusable="false"><ellipse cx="120" cy="235" rx="68" ry="9" fill="#000" opacity=".25"/><path d="M40 213 Q28 157 54 137 M39 188 Q15 179 24 160 M41 177 Q66 165 59 148" fill="none" stroke="#7f9a6c" stroke-width="3"/><path d="'+bowl+'" fill="#ffffff0a" stroke="#e4e9d4" stroke-width="2"/><path d="'+liquid+'" fill="'+color+'" opacity=".85"/>'+((coupe || wine || flute) ? '<path d="M120 158 V226 M95 227 H145" stroke="#e4e9d4" stroke-width="2"/>' : '<g fill="#fff" fill-opacity=".22" stroke="#fff" stroke-opacity=".25"><rect x="102" y="107" width="23" height="23" rx="4" transform="rotate(14 113 118)"/><rect x="120" y="143" width="22" height="24" rx="4" transform="rotate(-15 131 155)"/></g>')+'<circle cx="151" cy="'+((coupe || wine || flute)?'69':'82')+'" r="23" fill="#d6ba66" stroke="#f7e8a0" stroke-width="3"/><circle cx="151" cy="'+((coupe || wine || flute)?'69':'82')+'" r="17" fill="none" stroke="#fff1bf" stroke-width="1.5"/><path d="M102 48 L108 169" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/></svg>';
  }

  function ingredientLine(i) {
    if (!i[1]) {
      return i[2].replace(/^(\d+(?:[.,]\d+)?)/, function(n){return String(Number(n.replace(',','.'))*servings);});
    }
    var value=unit==='ml' ? i[1]*servings : i[1]*servings/29.5735;
    return value.toLocaleString('fr-CA',{maximumFractionDigits:unit==='ml'?1:2})+' '+unit+' '+i[2];
  }
  function card(x, open) {
    var c = effective(x.c), m = missing(c), r = ratings[c[0]] || { s: 0, n: "", m: 0 };
    var tag = m.length === 0 ? '<span class="tag ok">Prêt</span>' : '<span class="tag warn">Manque ' + m.length + '</span>';
    var ing = c[10].ingredients.map(function (i) { return "<li>" + esc(ingredientLine(i)) + "</li>"; }).join("");
    var steps = c[5].map(function (s) { return "<li>" + termLinks(s) + "</li>"; }).join("");
    var miss = m.length ? '<div class="tip" style="color:var(--warn)">Il te manque : ' + esc(m.join(", ")) + '.</div>' : "";
    var stars = [1, 2, 3, 4, 5].map(function (k) {
      return '<button class="star' + (k <= r.s ? " on" : "") + '" data-star="' + k + '" data-i="' + x.i + '" aria-label="' + k + ' étoile' + (k > 1 ? "s" : "") + '" aria-pressed="' + (k === r.s) + '">★</button>';
    }).join("");
    var rate = '<h3>Mon avis</h3><div class="rate"><div class="stars">' + stars + '</div><div class="rrow"><button class="pill" data-made="1" data-i="' + x.i + '">Je l’ai fait</button><span class="madecount">' + (r.m ? "Fait " + r.m + " fois" : "") + '</span></div>' +
      '<textarea class="note" aria-label="Mes notes sur ce cocktail" data-note="1" data-i="' + x.i + '" rows="2" maxlength="500" placeholder="Ma note : plus de lime, moins sucré…">' + esc(r.n) + '</textarea></div>';
    return '<details class="card"' + (open ? " open" : "") + '><summary><span class="cocktail-visual">' + drinkArt(c) + '</span><span class="name" data-name="'+esc(c[0])+'">' + esc(c[0]) + '</span>' + tag +
      '<span class="meta">' + pips(c[1]) + '<span>' + LV[c[1]] + '</span><span class="str s-' + c[7] + '">' + STRL[c[7]] + ' · ≈ ' + c[8] + ' %</span><span>' + esc(c[2]) + '</span><span class="mine">' + esc(mineText(r)) + '</span></span></summary>' +
      '<div class="body">' + variantControls(c,x.i) + '<p class="hint2">'+esc(c[10].status)+' · '+esc(c[10].access)+'<br>'+esc(c[10].levelReason)+'</p>' + miss + (m.length ? '<button class="pill" data-shop="'+x.i+'">Ajouter les ingrédients manquants à mes courses</button>' : '') + '<p class="flavour">' + esc(c[10].variantName || c[10].profile) + '</p><p class="hint2">' + esc(c[10].method) + ' · Dosages pour ' + servings + ' verre(s)</p><h3>Ingrédients</h3><ul class="ing">' + ing + '</ul><h3>Préparation <a href="#guide-techniques" class="guide-open">Comprendre les gestes ↗</a></h3><p class="hint2">Les quantités suivent le nombre de verres choisi. Les gestes et durées restent ceux d’un verre; agiter par lots de 1 à 2.</p><ol class="steps">' + steps + '</ol>' +
      '<p class="stdline">≈ ' + c[8] + ' % vol. · environ ' + c[9] + ' consommation(s) standard(s) par verre</p>' + (c[6] ? '<p class="tip">' + esc(c[6]) + '</p>' : "") + (c[10].source ? '<p class="source"><a href="'+esc(c[10].source)+'" target="_blank" rel="noopener noreferrer">Voir la formule IBA ↗</a></p>' : '') + '<p class="hint2">' + esc(c[10].note) + '</p>' + rate + '</div></details>';
  }

  function fillList(openName) {
    var el = document.getElementById("recList");
    if (!el) return;
    var list = filtered();
    if (openName) {
      for (var i = 0; i < list.length; i++) if (list[i].c[0] === openName && i >= ui.limit) ui.limit = i + 1;
    }
    document.getElementById("recCount").textContent = list.length + " recette" + (list.length > 1 ? "s" : "");
    var html = "";
    if (have.size === 0 && ui.avail !== "all") {
      html = '<div class="empty"><b>Aucun article dans ton bar</b><p>Ajoute tes bouteilles dans l’onglet Mon bar pour voir ce que tu peux préparer.</p><button class="pill" id="goBar">Aller à Mon bar</button></div>';
    } else if (!list.length) {
      html = '<div class="empty"><b>Aucun résultat</b><p>Essaie un autre niveau ou une autre recherche, ou affiche les cocktails où il manque un seul article.</p></div>';
    } else {
      html = list.slice(0, ui.limit).map(function (x) { return card(x, x.c[0] === openName); }).join("");
      if (list.length > ui.limit) html += '<button class="more" id="more">Afficher plus (' + (list.length - ui.limit) + ' restantes)</button>';
    }
    el.innerHTML = html;
  }

  function renderRec(openName) {
    var cnt = counts();
    var html = '<div class="filters"><p class="hint2">Simple : improviser au verre. Moyen : un geste de plus. Complexe : prévoir une technique ou un ingrédient spécialisé. La force se choisit séparément.</p>'+extraFilters()+'<div class="row" id="lv">';
    ["Tous", "Simple", "Moyen", "Complexe"].forEach(function (l, i) {
      html += '<button class="pill" data-lv="' + i + '" aria-pressed="' + (ui.level === i) + '">' + l + '</button>';
    });
    html += '</div><div class="row" id="st">';
    [["all", "Toutes forces"], ["f", "Faible"], ["m", "Moyen"], ["x", "Fort"]].forEach(function (a) {
      html += '<button class="pill" data-st="' + a[0] + '" aria-pressed="' + (ui.str === a[0]) + '">' + a[1] + '</button>';
    });
    html += '</div>' + '<p class="hint2">Faible : moins de 9 % (plus léger qu’un vin). Moyen : 9 à 18 %. Fort : 18 % et plus. Estimation avec la dilution de la glace.</p>' + '<div class="row" id="av">';
    [["ok", "Je peux les faire (" + cnt.ok + ")"], ["one", "Il manque au plus 1 article (" + (cnt.ok + cnt.one) + ")"], ["all", "Tous (" + C.length + ")"]].forEach(function (a) {
      html += '<button class="pill" data-av="' + a[0] + '" aria-pressed="' + (ui.avail === a[0]) + '">' + a[1] + '</button>';
    });
    html += '</div><div class="row" id="mn">';
    [["all", "Tous"], ["made", "Déjà faits"], ["fav", "Favoris (4★ et +)"], ["new", "À essayer"]].forEach(function (a) {
      html += '<button class="pill" data-mn="' + a[0] + '" aria-pressed="' + (ui.mine === a[0]) + '">' + a[1] + '</button>';
    });
    html += '</div><input type="search" id="q" aria-label="Chercher un cocktail ou un ingrédient" class="search" placeholder="Chercher un cocktail ou un ingrédient" value="' + esc(ui.q) + '" autocomplete="off">' +
      '<div class="row"><button class="surprise" id="rand">Surprends-moi</button></div></div>' +
      '<p class="count" id="recCount"></p><div class="list" id="recList"></div>';
    elRec.innerHTML = html;
    fillList(openName);
  }


  /* J'ai envie : choisir une bouteille et une vitesse, puis tourner les propositions */
  function usesBase(c, id) {
    return c[3].some(function (r) { return r.split("|").some(function (x) { return x === id || (SUB[x] || []).indexOf(id) > -1; }); });
  }
  function envPool() {
    return C.map(candidate).filter(function (x) {
      if (env.level && x.c[1] !== env.level) return false;
      if (env.str !== "all" && x.c[7] !== env.str) return false;
      if (x.m.length > (env.allowOne ? 1 : 0)) return false;
      if (env.base && !usesBase(x.c, env.base)) return false;
      if (env.newOnly) { var r = ratings[x.c[0]]; if (r && (r.m > 0 || r.s > 0)) return false; }
      return true;
    });
  }
  function rebuildQueue() {
    var q = envPool();
    for (var i = q.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), tmp = q[i]; q[i] = q[j]; q[j] = tmp; }
    function low(x) { var r = ratings[x.c[0]]; return r && r.s > 0 && r.s <= 2 ? 1 : 0; }
    q.sort(function (a, b) { return low(a) - low(b) || recent.indexOf(a.c[0]) - recent.indexOf(b.c[0]); });
    env.queue = q; env.pos = 0; env.wrapped = false;
  }
  function baseChips() {
    var out = [], covered = {};
    brands.forEach(function (b) { covered[b.id] = true; out.push([b.id, b.n]); });
    GROUPS.filter(function (g) { return g[2] !== "mx"; }).forEach(function (g) {
      g[1].forEach(function (p) {
        if (have.has(p[0]) && !covered[p[0]]) out.push([p[0], p[1].replace(/ \(.*\)$/, "")]);
      });
    });
    return out;
  }
  function renderEnv() {
    var html = '<div class="grp"><h2>Je veux boire</h2><div class="chips"><button class="chip" data-eb="" aria-pressed="' + (env.base === "") + '">Peu importe</button>';
    baseChips().forEach(function (b, i) {
      html += '<button class="chip" data-eb="' + b[0] + '" aria-pressed="' + (env.base === b[0]) + '">' + esc(b[1]) + '</button>';
    });
    html += '</div></div><div class="grp"><h2>Vitesse</h2><div class="row">';
    [[1, "Simple"], [2, "Moyen"], [3, "Complexe"], [0, "Peu importe"]].forEach(function (l) {
      html += '<button class="pill" data-el="' + l[0] + '" aria-pressed="' + (env.level === l[0]) + '">' + l[1] + '</button>';
    });
    html += '</div></div><div class="grp"><h2>Force</h2><div class="row">';
    [["all", "Peu importe"], ["f", "Faible"], ["m", "Moyen"], ["x", "Fort"]].forEach(function (a) {
      html += '<button class="pill" data-es="' + a[0] + '" aria-pressed="' + (env.str === a[0]) + '">' + a[1] + '</button>';
    });
    html += '</div>' + '<p class="hint2">Faible : moins de 9 % (plus léger qu’un vin). Moyen : 9 à 18 %. Fort : 18 % et plus. Estimation avec la dilution de la glace.</p>' + '</div><div class="grp"><div class="row">' +
      '<button class="pill" id="envNew" aria-pressed="' + env.newOnly + '">Seulement des nouveautés</button>' +
      '<button class="pill" id="envOne" aria-pressed="' + env.allowOne + '">Accepter 1 article manquant</button></div></div>' +
      '<div id="envRes"></div>';
    elEnv.innerHTML = html;
    fillEnv();
  }
  function fillEnv() {
    var el = document.getElementById("envRes");
    if (!el) return;
    var html = "";
    if (have.size === 0) {
      html = '<div class="empty"><b>Ton bar est vide</b><p>Ajoute tes bouteilles pour que je te propose quelque chose.</p><button class="pill" id="goBar">Aller à Mon bar</button></div>';
    } else if (!env.queue.length) {
      html = '<div class="empty"><b>Rien ne correspond</b><p>Essaie une autre vitesse, une autre bouteille, ou accepte un article manquant.</p></div>';
    } else {
      var x = env.queue[env.pos];
      recent=recent.filter(function(n){return n!==x.c[0];}); recent.push(x.c[0]); recent=recent.slice(-30);queueSave();
      html = '<p class="count">Proposition ' + (env.pos + 1) + ' sur ' + env.queue.length + (env.wrapped ? " · on recommence" : "") + '</p>' + card(x, true) +
        '<div class="row act"><button class="surprise" id="envNext">Un autre choix</button></div>';
    }
    el.innerHTML = html;
  }
  function nextChoice() {
    if (!env.queue.length) return;
    if (env.pos + 1 >= env.queue.length) {
      var last = env.queue[env.pos];
      rebuildQueue();
      if (env.queue.length > 1 && env.queue[0].c[0] === last.c[0]) env.queue.push(env.queue.shift());
      env.wrapped = true;
    } else { env.pos++; env.wrapped = false; }
    fillEnv();
  }

  function updateCounts() {
    document.getElementById("stat-items").textContent = have.size;
    document.getElementById("stat-ready").textContent = counts().ok;
    document.getElementById("stat-total").textContent = C.length;
    document.getElementById("n-bar").textContent = have.size;
    document.getElementById("n-rec").textContent = counts().ok;
  }
  function setTab(t) {
    ui.tab = t;
    [tabBar, tabEnv, tabRec, tabGuide].forEach(function(b,i){b.tabIndex = ["bar","env","rec","guide"][i] === t ? 0 : -1;});
    tabBar.setAttribute("aria-selected", t === "bar");
    tabEnv.setAttribute("aria-selected", t === "env");
    tabRec.setAttribute("aria-selected", t === "rec"); tabGuide.setAttribute("aria-selected",t==="guide");elGuide.hidden=t!=="guide";
    elBar.hidden = t !== "bar"; elEnv.hidden = t !== "env"; elRec.hidden = t !== "rec";
    if (t === "env") { rebuildQueue(); renderEnv(); }
    if (t === "rec") { ui.limit = 40; renderRec(); }
    window.scrollTo(0, 0);
  }
  function refresh() {
    updateCounts(); renderBar(); renderShopping();
    if (ui.tab === "rec") renderRec();
    if (ui.tab === "env") { rebuildQueue(); renderEnv(); }
  }

  tabGuide.onclick=function(){setTab("guide");};
  tabBar.onclick = function () { setTab("bar"); };
  tabEnv.onclick = function () { setTab("env"); };
  tabRec.onclick = function () { setTab("rec"); };

  function addBrand() {
    var inp = document.getElementById("brandIn"), cat = document.getElementById("brandCat"), hint = document.getElementById("hint");
    var name = inp.value.trim().slice(0, 60);
    if (!name) { hint.textContent = "Entre un nom de marque."; return; }
    if (!cat.value) { hint.textContent = "Choisis une catégorie pour cette bouteille."; return; }
    have.add(cat.value);
    brands.push({ n: name, id: cat.value });
    queueSave(); refresh();
  }

  elBar.addEventListener("input", function (e) {
    if (e.target.id === "brandIn") {
      var g = guess(e.target.value);
      if (g) document.getElementById("brandCat").value = g;
      document.getElementById("hint").textContent = "";
    }
  });
  elBar.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "brandIn") { e.preventDefault(); addBrand(); }
  });
  elBar.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (chip) {
      var id = chip.getAttribute("data-id");
      if (have.has(id)) have.delete(id); else have.add(id);
      chip.setAttribute("aria-pressed", have.has(id));
      var h = chip.closest(".grp");
      var g = GROUPS.filter(function (x) { return h.dataset.group === x[0]; })[0];
      if (g) h.querySelector("small").textContent = g[1].filter(function (p) { return have.has(p[0]); }).length + " / " + g[1].length;
      updateCounts(); queueSave();
      var empty = elBar.querySelector(".empty");
      if (empty && have.size) empty.remove();
      return;
    }
    var rm = e.target.closest("[data-rm]");
    if (rm) { brands.splice(+rm.getAttribute("data-rm"), 1); queueSave(); refresh(); return; }
    if (e.target.id === "brandAdd") { addBrand(); return; }
    if (e.target.id === "clear") { have.clear(); brands = []; queueSave(); refresh(); }
    if (e.target.id === "sample") {
      ["vodka", "gin", "rhum_blanc", "bourbon", "tequila", "triple_sec", "vermouth_doux", "campari", "citron", "lime", "sirop", "soda", "tonic", "cola", "orange", "angostura"].forEach(function (i) { have.add(i); });
      queueSave(); refresh();
    }
  });

  elRec.addEventListener("input", function (e) {
    if (e.target.id === "q") { ui.q = e.target.value; ui.limit = 40; fillList(); }
  });
  elRec.addEventListener("click", function (e) {
    if (handleExtra(e)) return;
    if (handleRate(e)) return;
    var lv = e.target.closest("[data-lv]"), av = e.target.closest("[data-av]"), mn = e.target.closest("[data-mn]"), st = e.target.closest("[data-st]");
    if (st) { ui.str = st.getAttribute("data-st"); ui.limit = 40; renderRec(); }
    else if (mn) { ui.mine = mn.getAttribute("data-mn"); ui.limit = 40; renderRec(); }
    else if (lv) { ui.level = +lv.getAttribute("data-lv"); ui.limit = 40; renderRec(); }
    else if (av) { ui.avail = av.getAttribute("data-av"); ui.limit = 40; renderRec(); }
    else if (e.target.id === "goBar") setTab("bar");
    else if (e.target.id === "more") { ui.limit += 40; fillList(); }
    else if (e.target.id === "rand") {
      var pool = filtered().filter(function (x) { return x.m.length === 0 && !recent.includes(x.c[0]); });
      if (!pool.length) pool = filtered().filter(function(x){return x.m.length===0;});
      if (!pool.length) pool=filtered();
      if (!pool.length) return;
      var pick = pool[Math.floor(Math.random() * pool.length)]; recent.push(pick.c[0]);recent=recent.slice(-30);queueSave();
      fillList(pick.c[0]);
      var open = elRec.querySelector("details[open]");
      if (open) open.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  elRec.addEventListener("input", handleNote);
  elEnv.addEventListener("input", handleNote);
  elRec.addEventListener("change", handleNote);
  elEnv.addEventListener("change", handleNote);
  elEnv.addEventListener("click", function (e) {
    if (handleExtra(e)) return;
    if (handleRate(e)) return;
    var eb = e.target.closest("[data-eb]"), el = e.target.closest("[data-el]"), es = e.target.closest("[data-es]");
    if (es) { env.str = es.getAttribute("data-es"); rebuildQueue(); renderEnv(); }
    else if (eb) { env.base = eb.getAttribute("data-eb"); rebuildQueue(); renderEnv(); }
    else if (el) { env.level = +el.getAttribute("data-el"); rebuildQueue(); renderEnv(); }
    else if (e.target.id === "envNew") { env.newOnly = !env.newOnly; rebuildQueue(); renderEnv(); }
    else if (e.target.id === "envOne") { env.allowOne = !env.allowOne; rebuildQueue(); renderEnv(); }
    else if (e.target.id === "envNext") nextChoice();
    else if (e.target.id === "goBar") setTab("bar");
  });

  /* Démarrage : affichage immédiat, puis chargement du bar enregistré */
  document.getElementById("hero-art").innerHTML = '<img src="assets/bar.png" alt="Trois cocktails servis dans une ambiance de bar chaleureuse" width="1536" height="1024">';
  document.getElementById("discover").onclick = function () { setTab("bar"); };
  [tabBar, tabEnv, tabRec, tabGuide].forEach(function(tab, i, tabs) {
    var key = ["bar", "env", "rec", "guide"][i];
    tab.setAttribute("aria-controls", "view-" + key);
    tab.tabIndex=i===0?0:-1;
    document.getElementById("view-" + key).setAttribute("role", "tabpanel");
    document.getElementById("view-" + key).setAttribute("aria-labelledby", tab.id);
    tab.addEventListener("keydown", function(e) {
      if (["ArrowRight", "ArrowLeft", "Home", "End"].indexOf(e.key) < 0) return;
      e.preventDefault();
      var next = e.key === "Home" ? 0 : e.key === "End" ? 3 : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
      tabs[next].click(); tabs[next].focus();
    });
  });
  ['unit','servings'].forEach(function(id){document.getElementById(id).addEventListener('change',function(e){
    var names=Array.from(document.querySelectorAll('details.card[open] .name')).map(function(n){return n.dataset.name || n.textContent;});
    if(id==='unit')unit=e.target.value;else servings=Number(e.target.value);
    if(ui.tab==='rec')renderRec(names[0]);if(ui.tab==='env')fillEnv();
  });});
  installGuide();
  applySaved(lsGet());
  refresh();

  (async function () {
    try {
      if (typeof claude === "undefined") return;
      var db = await claude.use("db"), user = await claude.use("user");
      if (!db || !user) return;
      var uid = await user.id();
      if (!uid) return;
      dbDoc = db.doc("data/users/" + uid + "/bar");
      var snap = await dbDoc.get();
      if (snap.exists && snap.data()) {
        applySaved(snap.data());
        lsSet(snapshot());
        refresh();
      } else if (have.size || brands.length) {
        dirty = true; flush();
      }
    } catch (e) { dbDoc = null; }
  })();

})();
