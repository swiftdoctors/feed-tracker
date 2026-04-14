import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, query, addDoc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { MapPin, Plus, Camera, FileSpreadsheet, Home, Activity, Wifi, WifiOff, ChevronLeft, Calendar, Thermometer, Droplets, CheckCircle, AlertTriangle, Syringe, Trash2, User, LogOut, Settings, Navigation, PackageCheck, Edit2, Search, TrendingUp, BarChart2, Printer, Share2 } from 'lucide-react';

// --- Embedded Logo Constant ---
// REPLACE THIS URL or BASE64 STRING WITH YOUR ACTUAL LOGO
const CUSTOM_LOGO_URL = "https://images.unsplash.com/photo-1599422314077-f4dfdaa4cd09?w=150&h=150&fit=crop&crop=faces&q=80";

// --- Firebase Initialization ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'poultry-pwa-app';

// --- Utility Components ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: 'bg-white text-[#1d73a5]',
    error: 'bg-red-500 text-white',
    info: 'bg-white/20 text-white backdrop-blur-md border border-white/30'
  };

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 ${bgColors[type] || bgColors.info} px-6 py-3 rounded-full shadow-lg z-50 flex items-center gap-2 transition-all duration-300 animate-fade-in-down w-[90%] max-w-sm justify-center font-medium print:hidden`}>
      {type === 'success' && <CheckCircle size={18} className="text-[#1d73a5]" />}
      {type === 'error' && <AlertTriangle size={18} />}
      <span className="text-sm">{message}</span>
    </div>
  );
};

// --- Custom Chart Component ---
const LineChart = ({ data, xKey, yKey, color, label, unit }) => {
  if (!data || data.length === 0) return <div className="text-white/50 print:text-gray-500 text-xs italic py-4 text-center">Insufficient data for curve generation</div>;
  
  const maxDataY = Math.max(...data.map(d => Number(d[yKey]) || 0));
  const minDataY = Math.min(...data.map(d => Number(d[yKey]) || 0));
  const maxY = maxDataY === 0 ? 10 : maxDataY * 1.1; 
  
  const width = 300; 
  const height = 100;
  
  const points = data.map((d, i) => {
      const x = data.length === 1 ? width/2 : (i / (data.length - 1)) * width;
      const y = height - ((Number(d[yKey]) || 0) / maxY) * height;
      return `${x},${y}`;
  }).join(' ');

  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-white/70 print:text-black font-bold tracking-wider uppercase mb-2">
        <span>{label}</span>
        <span className="text-[#FFDF00] print:text-black">Peak: {maxDataY.toFixed(2)} {unit}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28 overflow-visible">
        {/* Grid lines */}
        <line x1="0" y1={height} x2={width} y2={height} stroke="#ffffff33" className="print:stroke-gray-200" strokeWidth="1" />
        <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#ffffff22" className="print:stroke-gray-200" strokeDasharray="4" />
        <line x1="0" y1={0} x2={width} y2={0} stroke="#ffffff11" className="print:stroke-gray-100" strokeDasharray="2" />
        
        {/* Shadow/Glow Line */}
        <polyline fill="none" stroke={color} strokeWidth="6" points={points} strokeLinejoin="round" strokeLinecap="round" opacity="0.3" filter="blur(2px)" className="print:hidden" />
        {/* Main Line */}
        <polyline fill="none" stroke={color} className="print:stroke-black" strokeWidth="2.5" points={points} strokeLinejoin="round" strokeLinecap="round" />
        
        {/* Data Points */}
        {data.map((d, i) => {
           const x = data.length === 1 ? width/2 : (i / (data.length - 1)) * width;
           const y = height - ((Number(d[yKey]) || 0) / maxY) * height;
           return <circle key={i} cx={x} cy={y} r="3.5" fill="#1d73a5" className="print:fill-white" stroke={color} strokeWidth="2" />
        })}
      </svg>
      <div className="flex justify-between text-[9px] text-white/50 print:text-gray-500 mt-3 uppercase tracking-widest font-bold">
        <span>Day {data[0][xKey]}</span>
        <span>Day {data[data.length-1][xKey]}</span>
      </div>
    </div>
  );
}

// --- Image Compression ---
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const getLocalYYYYMMDD = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

const getDaysBetween = (startStr, endStr) => {
  if (!startStr || !endStr) return 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const utc1 = Date.UTC(sy, sm - 1, sd);
  const utc2 = Date.UTC(ey, em - 1, ed);
  return Math.max(0, Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24)));
};

// --- Accurate Nepal 77 Districts Dataset ---
const nepalLocations = {
  "Achham": ["Bannigadhi Jayagadh Rural", "Chaurpati Rural", "Dhakari Rural", "Kamalbazar", "Mangalsen", "Mellekh Rural", "Panchadewal Binayak", "Ramaroshan Rural", "Sanphebagar", "Turmakhad Rural"],
  "Arghakhanchi": ["Bhumekasthan", "Chhatradev Rural", "Malarani Rural", "Panini Rural", "Sandhikharka", "Shitaganga"],
  "Baglung": ["Baglung", "Bareng Rural", "Dhorpatan", "Galkot", "Jaimini", "Kanthekhola Rural", "Nisikhola Rural", "Taman Khola Rural", "Tara Khola Rural", "Badigad Rural"],
  "Baitadi": ["Amargadhi", "Dasharathchand", "Dilashaini Rural", "Dogadakedar Rural", "Melauli", "Pancheshwar", "Patarya Rural", "Purchaudi", "Shivanath Rural", "Sigas Rural", "Surnaya Rural"],
  "Bajhang": ["Bithadchir Rural", "Bungal", "Chabispathibhera Rural", "Durgathali Rural", "Jaya Prithvi", "Kanda Rural", "Kedarsyu Rural", "Khaptadchhanna Rural", "Masta Rural", "Surma Rural", "Talkot Rural", "Thalara Rural"],
  "Bajura": ["Badimalika", "Budhiganga", "Budhinanda", "Chhededaha", "Gaumul Rural", "Himali Rural", "Jagannath", "Khaptad Chhededaha Rural", "Pandav Gupha Rural", "Swami Kartik Rural", "Tribeni", "Tatopani Rural"],
  "Banke": ["Baijanath Rural", "Duduwa Rural", "Janaki Rural", "Khajura Rural", "Kohalpur", "Narainapur Rural", "Nepalgunj Sub-Metropolitan", "Rapti Sonari Rural"],
  "Bara": ["Adarsh Kotwal", "Baragadhi Rural", "Bishrampur Rural", "Devtal Rural", "Jitpur Simara Sub-Metropolitan", "Kalaiya Sub-Metropolitan", "Karaiyamai Rural", "Kolhabi", "Mahagadhimai", "Nijgadh", "Pacharauta Rural", "Parwanipur Rural", "Pheta Rural", "Prasauni Rural", "Simraungadh", "Suwarna Rural"],
  "Bardiya": ["Badhaiyatal Rural", "Bansgadhi", "Barbardiya", "Geruwa", "Gulariya", "Madhuwan", "Rajapur", "Thakurbaba"],
  "Bhaktapur": ["Bhaktapur", "Changunarayan", "Madhyapur Thimi", "Suryabinayak"],
  "Bhojpur": ["Aamchok", "Arun Rural", "Bhojpur", "Hatuwagadhi Rural", "Pauwadungma Rural", "Ramprasad Rai Rural", "Salpasilichho Rural", "Shadanand", "Tyamke Maiyunm Rural"],
  "Chitwan": ["Bharatpur Metropolitan", "Ichchhakamana Rural", "Kalika", "Khairahani", "Madi", "Rapti", "Ratnanagar"],
  "Dadeldhura": ["Aalital", "Amargadhi", "Bhageshwar Rural", "Navadurga Rural", "Ganyapdhura Rural", "Parshuram", "Ajayameru Rural"],
  "Dailekh": ["Aathabis", "Bhagawatimai Rural", "Bhairabi Rural", "Chamunda Bindrasaini", "Dullu", "Dungeshwar Rural", "Gurans Rural", "Mahabu Rural", "Narayan", "Naumule Rural", "Thantikandh Rural"],
  "Dang": ["Babai Rural", "Banglachuli Rural", "Dangisharan Rural", "Gadhawa Rural", "Ghorahi Sub-Metropolitan", "Lamahi", "Rajpur Rural", "Rapti Rural", "Shantinagar Rural", "Tulsipur Sub-Metropolitan"],
  "Darchula": ["Apihimal Rural", "Byas Rural", "Dunhu Rural", "Lekam Rural", "Mahakali", "Malikarjun Rural", "Marma Rural", "Naugad Rural", "Shailyashikhar"],
  "Dhading": ["Benighat Rorang Rural", "Dhunibeshi", "Gajuri Rural", "Galchhi Rural", "Gangajamuna Rural", "Jwalamukhi Rural", "Khaniyabas Rural", "Netrawati Rural", "Nilkantha", "Rubi Valley Rural", "Siddhalek Rural", "Thakre Rural", "Tripurasundari Rural"],
  "Dhankuta": ["Chhathar Jorpati Rural", "Chaubise Rural", "Dhankuta", "Khalasa Chhintang Sahidbhumi Rural", "Mahalaxmi", "Pakhribas", "Sangurigadhi Rural"],
  "Dhanusha": ["Aaurahi Rural", "Bateshwar", "Bideha", "Chhireshwarnath", "Dhanauji", "Dhanushadham", "Ganeshman Charnath", "Hansapur", "Janak Nandini Rural", "Janakpurdham Sub-Metropolitan", "Kamala", "Mithila", "Mithila Bihari", "Mukhiyapatti Musharniya Rural", "Nagarain Rural", "Sabaila", "Sahidnagar", "Shahidnagar", "Vedeha"],
  "Dolakha": ["Baiteshwar Rural", "Bhimeshwar", "Bigu Rural", "Gaurishankar Rural", "Jiri", "Kalinchok Rural", "Melung Rural", "Sailung Rural", "Tamakoshi Rural"],
  "Dolpa": ["Chharka Tangsong Rural", "Dolpo Buddha Rural", "Jagadulla Rural", "Kaike Rural", "Mudkechula Rural", "Shey Phoksundo Rural", "Thuli Bheri", "Tripurasundari"],
  "Doti": ["Adarsha Rural", "Badikedar Rural", "Bogatan Rural", "Dipayal Silgadhi", "Jorayal Rural", "K.I. Singh Rural", "Purbichauki Rural", "Sayal Rural", "Shikhar"],
  "Eastern Rukum": ["Bhume Rural", "Putha Uttarganga Rural", "Sisne Rural"],
  "Gorkha": ["Aarughat Rural", "Ajirkot", "Barpak Sulikot Rural", "Bhimsen Thapa Rural", "Chum Nubri Rural", "Dharche Rural", "Gandaki Rural", "Gorkha", "Palungtar", "Sahid Lakhan Rural", "Siranchowk Rural"],
  "Gulmi": ["Chandrakot Rural", "Chatrakot Rural", "Dhurkot Rural", "Gulmidarbar Rural", "Isma Rural", "Kaligandaki Rural", "Madane Rural", "Malika Rural", "Musikot", "Resunga", "Rurukshetra Rural", "Satyawati Rural"],
  "Humla": ["Adanchuli Rural", "Chankheli Rural", "Kharpunath Rural", "Namkha Rural", "Sarkegad Rural", "Simkot Rural", "Tanjakot Rural"],
  "Ilam": ["Chulachuli Rural", "Deumai", "Fakphokthum Rural", "Ilam", "Mai Jogmai Rural", "Mai", "Mangsebung Rural", "Rong Rural", "Sandakpur Rural", "Suryodaya"],
  "Jajarkot": ["Barekot Rural", "Bheri", "Chhedagad", "Cushe Rural", "Junichande Rural", "Nalgad", "Shivalaya Rural"],
  "Jhapa": ["Arjundhara", "Barhadashi Rural", "Bhadrapur", "Birtamod", "Buddhashanti Rural", "Damak", "Gauradaha", "Gaurigunj Rural", "Haldibari Rural", "Jhapa Rural", "Kachankawal Rural", "Kamal Rural", "Kankai", "Mechinagar", "Shivasatakshi"],
  "Jumla": ["Chandannath", "Guthichaur Rural", "Hima Rural", "Kanakasundari Rural", "Patarasi Rural", "Sinja Rural", "Tatopani Rural", "Tila Rural"],
  "Kailali": ["Bardagoriya", "Bhajani", "Chure Rural", "Dhangadhi Sub-Metropolitan", "Gauriganga", "Ghodaghodi", "Janaki Rural", "Joshipur", "Kailari Rural", "Lamki Chuha", "Mohanyal Rural", "Tikapur", "Godawari"],
  "Kalikot": ["Khandachakra", "Mahawai Rural", "Naraharinath Rural", "Pachaljharana Rural", "Palata Rural", "Raskot", "Sanni Triveni Rural", "Subha Kalika Rural", "Tilagufa"],
  "Kanchanpur": ["Bedkot", "Belauri", "Bhimdatta", "Dodhara Chandani", "Krishnapur", "Laljhadi Rural", "Punarbas", "Shuklaphanta"],
  "Kapilvastu": ["Baanganga", "Buddhabhumi", "Kapilvastu", "Krishnanagar", "Maharajganj", "Mayadevi Rural", "Shivaraj", "Sudhodhan Rural", "Yashodhara Rural", "Bijaynagar"],
  "Kaski": ["Annapurna Rural", "Machhapuchchhre Rural", "Madi Rural", "Pokhara Metropolitan", "Rupa Rural"],
  "Kathmandu": ["Budhanilkantha", "Chandragiri", "Dakshinkali", "Gokarneshwar", "Kageshwori Manohara", "Kathmandu Metropolitan", "Kirtipur", "Nagarjun", "Shankharapur", "Tarakeshwar", "Tokha"],
  "Kavrepalanchok": ["Banepa", "Bethanchowk Rural", "Bhumlu Rural", "Chaurideurali Rural", "Dhulikhel", "Mahabharat Rural", "Mandandeupur", "Namobuddha", "Panauti", "Panchkhal", "Roshi Rural", "Temal Rural"],
  "Khotang": ["Aiselukharka Rural", "Barahapokhari Rural", "Diktel Rupakot Majhuwagadhi", "Diprung Chuichumma Rural", "Halesi Tuwachung", "Jantedhunga Rural", "Kepilasgadhi Rural", "Khotehang Rural", "Rawabesi Rural", "Sakela Rural"],
  "Lalitpur": ["Bagmati Rural", "Godawari", "Konjyosom Rural", "Lalitpur Metropolitan", "Mahalaxmi", "Mahankal Rural"],
  "Lamjung": ["Besisahar", "Dordi Rural", "Dudhpokhari Rural", "Kwholasothar Rural", "Madhya Nepal", "Marshyangdi Rural", "Rainas", "Sundarbazar"],
  "Mahottari": ["Aurahi", "Balawa", "Bardibas", "Bhangaha", "Ekdara Rural", "Gaushala", "Jaleshwar", "Loharpatti", "Mahottari Rural", "Manra Siswa", "Matihani", "Pipra Rural", "Ramgopalpur", "Samsi", "Sonama Rural"],
  "Makwanpur": ["Bagmati Rural", "Bakaiya Rural", "Bhimphedi Rural", "Hetauda Sub-Metropolitan", "Indrasarowar Rural", "Kailash Rural", "Makawanpurgadhi Rural", "Manahari Rural", "Raksirang Rural", "Thaha"],
  "Manang": ["Chame Rural", "Narpa Bhumi Rural", "Nason Rural", "Manang Ngisyang Rural"],
  "Morang": ["Belbari", "Biratnagar Metropolitan", "Budhiganga Rural", "Dhanpalthan Rural", "Gramthan Rural", "Jahada Rural", "Kanepokhari Rural", "Katahari Rural", "Kerabari Rural", "Letang", "Miklajung Rural", "Pathari Sanischare", "Rangeli", "Ratuwamai", "Sunawarshi", "Sundar Haraicha", "Urlabari"],
  "Mugu": ["Chhayanath Rara", "Khatyad Rural", "Mugum Karmarong Rural", "Soru Rural"],
  "Mustang": ["Baragung Muktichhetra Rural", "Gharapjhong Rural", "Lo-Ghekar Damodarkunda Rural", "Lomanthang Rural", "Thasang Rural"],
  "Myagdi": ["Annapurna Rural", "Beni", "Dhaulagiri Rural", "Malika Rural", "Mangala Rural", "Raghuganga Rural"],
  "Nawalpur": ["Baudikali Rural", "Binawyi Triveni Rural", "Bulingtar Rural", "Devchuli", "Gaindakot", "Hupsekot Rural", "Kawasoti", "Madhyabindu"],
  "Nuwakot": ["Belkotgadhi", "Bidur", "Dupcheshwar Rural", "Kispang Rural", "Likhu Rural", "Myagang Rural", "Panchakanya Rural", "Shivapuri Rural", "Suryagadhi Rural", "Tadi Rural", "Tarkeshwar Rural", "Kakani Rural"],
  "Okhaldhunga": ["Champadevi Rural", "Chishankhugadhi Rural", "Khijidemba Rural", "Likhu Rural", "Manebhanjyang Rural", "Molung Rural", "Siddhicharan", "Sunkoshi Rural"],
  "Palpa": ["Bagnaskali Rural", "Mathagadhi Rural", "Nisdi Rural", "Purbakhola Rural", "Rambha Rural", "Rampur Rural", "Ribdikot Rural", "Tansen", "Tinau Rural", "Rainadevi Chhahara Rural"],
  "Panchthar": ["Falelung Rural", "Falgunanda Rural", "Hilihang Rural", "Kummayak Rural", "Miklajung Rural", "Phidim", "Tumewa Rural", "Yangwarak Rural"],
  "Parasi": ["Bardaghat", "Palhinandan Rural", "Pratappur Rural", "Ramgram", "Sarawal Rural", "Sunwal", "Susta Rural"],
  "Parbat": ["Bihadi Rural", "Jaljala Rural", "Kushma", "Mahashila Rural", "Modi Rural", "Paiyun Rural", "Phalebas"],
  "Parsa": ["Bahudarmai", "Bindabasini", "Birgunj Metropolitan", "Chhipahrmai Rural", "Dhobini Rural", "Jagarnathpur Rural", "Jirabhawani Rural", "Kalikamai Rural", "Pakahamainpur Rural", "Parsagadhi", "Paterwa Sugauli Rural", "Pokhariya", "Sakhuwa Prasauni Rural", "Thori Rural"],
  "Pyuthan": ["Ayushmati Rural", "Gaumukhi Rural", "Jhimruk Rural", "Mallarani Rural", "Mandavi Rural", "Naubahini Rural", "Pyuthan", "Sarumarani Rural", "Swargadwari"],
  "Ramechhap": ["Doramba Rural", "Gokulganga Rural", "Khandadevi Rural", "Likhu Tamakoshi Rural", "Manthali", "Ramechhap", "Sunapati Rural", "Umakunda Rural"],
  "Rasuwa": ["Aamachodingmo Rural", "Gosaikunda Rural", "Kalika Rural", "Naukunda Rural", "Uttargaya Rural"],
  "Rautahat": ["Baudhimai", "Brindaban", "Chandrapur", "Dewahi Gonahi", "Durga Bhagwati", "Fatuwa Bijayapur", "Garuda", "Gaur", "Gujara", "Ishanath", "Katahariya", "Madhav Narayan", "Maulapur", "Paroha", "Phatuwa Bijayapur", "Rajdevi", "Rajpur", "Yemunamai"],
  "Rolpa": ["Gangadev Rural", "Madi Rural", "Paribartan Rural", "Rolpa", "Runtigadhi Rural", "Sunchhahari Rural", "Suwarnawati Rural", "Thawang Rural", "Triveni Rural"],
  "Rupandehi": ["Butwal Sub-Metropolitan", "Devdaha", "Gaidahawa Rural", "Kanchan Rural", "Kotahimai Rural", "Lumbini Sanskritik", "Marchawari Rural", "Mayadevi Rural", "Omsatiya Rural", "Rohini Rural", "Sainamaina", "Sammarimai Rural", "Siddharthanagar", "Siyari Rural", "Sudhodhan Rural", "Tillotama"],
  "Salyan": ["Bagchaur", "Bangad Kupinde", "Chhatreshwari", "Darma Rural", "Kapurkot Rural", "Kumakh Rural", "Shaarda", "Siddha Kumakh Rural", "Tribeni Rural"],
  "Sankhuwasabha": ["Bhotkhola Rural", "Chainpur", "Chichila Rural", "Dharmadevi", "Khandbari", "Madi", "Makalu Rural", "Panchkhapan", "Sabhapokhari", "Silichong Rural"],
  "Saptari": ["Agnisair Krishna Savaran Rural", "Balan-Bihul Rural", "Bishnupur Rural", "Bodebarsaien", "Chhinnamasta", "Dakneshwori", "Hanumannagar Kankalini", "Kanchanrup", "Khadak", "Mahadeva Rural", "Rajbiraj", "Rupani", "Shambhunath", "Surunga", "Tilahathi Rural", "Tirhut Rural"],
  "Sarlahi": ["Bagmati", "Balara", "Barahathwa", "Basbariya", "Brahmapuri Rural", "Chakraghatta Rural", "Chandranagar Rural", "Dhankaul Rural", "Godaita", "Haripur", "Haripurwa", "Hariwan", "Ishworpur", "Kaudena Rural", "Lalbandi", "Malangwa", "Parsa Rural", "Ramnagar Rural", "Vishnu Rural"],
  "Sindhuli": ["Dudhouli", "Golanjor Rural", "Ghyanglekh Rural", "Hariharpurgadhi Rural", "Kamalamai", "Marin Rural", "Phikkal Rural", "Sunkoshi Rural", "Tinpatan Rural"],
  "Sindhupalchok": ["Balephi Rural", "Bahrabise", "Bhotekoshi Rural", "Chautara SangachokGadhi", "Helambu Rural", "Indrawati Rural", "Jugal Rural", "Lisankhu Pakhar Rural", "Melamchi", "Panchpokhari Thangpal Rural", "Sunkoshi Rural", "Tripurasundari Rural"],
  "Siraha": ["Arnama Rural", "Aurahi Rural", "Bariyarpatti Rural", "Bhagawanpur Rural", "Bishnupur Rural", "Dhangadhimai", "Golbazar", "Kalyanpur", "Karjanha", "Lahan", "Lakshmipur Patari Rural", "Mirchaiya", "Naraha Rural", "Navarajpur Rural", "Sakhuwanankarkatti Rural", "Siraha", "Sukhipur"],
  "Solukhumbu": ["Dudhkaushika Rural", "Dudhkoshi Rural", "Khumbu Pasang Lhamu Rural", "Likhupike Rural", "Mahakulung Rural", "Nechasalyan Rural", "Solududhkunda", "Sotang Rural"],
  "Sunsari": ["Barahachhetra", "Barju Rural", "Bhokraha Rural", "Dewanganj Rural", "Dharan Sub-Metropolitan", "Duhabi", "Gadhi Rural", "Harinagar Rural", "Inaruwa", "Itahari Sub-Metropolitan", "Koshi Rural", "Ramdhuni"],
  "Surkhet": ["Barahatal Rural", "Bheriganga Rural", "Birendranagar", "Chaukune Rural", "Chingad Rural", "Gurbhakot", "Lekbeshi", "Panchapuri", "Simta Rural"],
  "Syangja": ["Aandhikhola Rural", "Arjun Chaupari Rural", "Bheerkot Rural", "Biruwa Rural", "Chapakot", "Galyang", "Harinas Rural", "Kaligandaki Rural", "Phedikhola Rural", "Putalibazar", "Waling"],
  "Tanahun": ["Aanbookhaireni Rural", "Bandipur", "Bhanu", "Bhimad Rural", "Byas", "Devghat Rural", "Ghiring Rural", "Myagde Rural", "Rhishing Rural", "Shuklagandaki"],
  "Taplejung": ["Aathrai Triveni Rural", "Faktanglung Rural", "Maiwakhola Rural", "Merikaing Rural", "Mikwakhola Rural", "Phungling", "Sidingba Rural", "Sirijangha Rural", "Yangwarak Rural"],
  "Terhathum": ["Aathrai Rural", "Chhathar Rural", "Laligurans", "Menchhayayem Rural", "Myanglung", "Phedap Rural"],
  "Udayapur": ["Belaka", "Chaudandigadhi", "Katari", "Limchungbung Rural", "Rautamai Rural", "Tapli Rural", "Triyuga", "Udayapurgadhi Rural"],
  "Western Rukum": ["Aathbiskot", "Banfikot", "Chaurjahari", "Musikot", "Sani Bheri Rural", "Tribeni Rural"]
};

// --- Main Application ---
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [view, setView] = useState({ name: 'dashboard', params: {} });
  const [farms, setFarms] = useState([]);
  const [batches, setBatches] = useState([]);
  const [visits, setVisits] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        showToast("Authentication failed", "error");
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    if (!user) return;

    const farmsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'farms');
    const batchesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'batches');
    const visitsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'visits');

    const unsubFarms = onSnapshot(farmsRef, (snapshot) => setFarms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubBatches = onSnapshot(batchesRef, (snapshot) => setBatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubVisits = onSnapshot(visitsRef, (snapshot) => setVisits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

    return () => { unsubFarms(); unsubBatches(); unsubVisits(); };
  }, [user]);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const navigate = (name, params = {}) => setView({ name, params });

  // --- Advanced Segregated Longitudinal Excel Export ---
  const handleExport = async () => {
    if (!window.XLSX) {
      showToast("Loading Excel Data Engine...", "info");
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = resolve;
        document.body.appendChild(script);
      });
    }

    try {
      const wb = window.XLSX.utils.book_new();

      const getFarmName = (id) => farms.find(f => f.id === id)?.name || 'Unknown';
      const getFarmType = (id) => farms.find(f => f.id === id)?.type || 'Unknown';
      const getBatchName = (id) => batches.find(b => b.id === id)?.name || 'Unknown';

      // Sort visits Longitudinally: Farm -> Batch -> Date
      const sortedVisits = [...visits].sort((a, b) => {
        const fNameA = getFarmName(a.farmId);
        const fNameB = getFarmName(b.farmId);
        if (fNameA !== fNameB) return fNameA.localeCompare(fNameB);
        const bNameA = getBatchName(a.batchId);
        const bNameB = getBatchName(b.batchId);
        if (bNameA !== bNameB) return bNameA.localeCompare(bNameB);
        return new Date(a.date) - new Date(b.date);
      });

      const farmsSheet = window.XLSX.utils.json_to_sheet(farms.map(f => ({
        'Farm ID': f.id, 'Name': f.name, 'Owner': f.owner, 'Phone': f.phone,
        'District': f.district, 'Municipality': f.municipality, 'Ward': f.ward,
        'Type Tag': f.type, 'Coordinates': f.lat ? `${f.lat}, ${f.lng}` : 'N/A'
      })));
      window.XLSX.utils.book_append_sheet(wb, farmsSheet, "1. Farms Directory");

      const summaryStatsData = batches.map(b => {
        const farm = farms.find(f => f.id === b.farmId) || {};
        const bVisits = sortedVisits.filter(v => v.batchId === b.id);
        const lastVisit = bVisits.length > 0 ? bVisits[bVisits.length - 1] : null;
        
        let avgTemp = null, avgHum = null;
        if (bVisits.length > 0) {
            const tempVisits = bVisits.filter(v => v.temperature);
            if (tempVisits.length > 0) avgTemp = (tempVisits.reduce((acc, v) => acc + Number(v.temperature), 0) / tempVisits.length).toFixed(1);
            const humVisits = bVisits.filter(v => v.humidity);
            if (humVisits.length > 0) avgHum = (humVisits.reduce((acc, v) => acc + Number(v.humidity), 0) / humVisits.length).toFixed(1);
        }

        return {
            'Farm': farm.name || 'Unknown', 'Farm Type': farm.type || 'Unknown', 'Batch': b.name,
            'Status': b.active ? 'Active' : 'Closed/Sold', 'Placement Date': b.arrivalDate,
            'Chicks Placed': Number(b.chicksPlaced),
            'Final/Current Birds Alive': lastVisit ? Number(lastVisit.birdsAlive) : Number(b.chicksPlaced),
            'Total Mortality %': lastVisit ? Number(lastVisit.mortalityPercent) : 0,
            'Final/Current Weight (g)': b.finalWeight ? Number(b.finalWeight) : (lastVisit ? Number(lastVisit.weight) : 0),
            'Total Feed Consumed (kg)': lastVisit ? Number(lastVisit.cumulativeFeed) : 0,
            'Final FCR': lastVisit ? Number(lastVisit.fcr) : null,
            'Avg Lifetime Temp (°C)': avgTemp ? Number(avgTemp) : null, 'Avg Lifetime Humidity (%)': avgHum ? Number(avgHum) : null,
            'Birds Sold (If Closed)': b.birdsSold ? Number(b.birdsSold) : 'N/A', 'Sale Date': b.soldDate || 'N/A'
        }
      });
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(summaryStatsData), "2. Batch Summary Stats");

      // Core Longitudinal Matrix
      let lastVisitWeight = {}; 
      const visitsSheetData = sortedVisits.map(v => {
        let adwg = 0;
        if (lastVisitWeight[v.batchId]) {
            const weightDiff = Number(v.weight) - lastVisitWeight[v.batchId].weight;
            const daysDiff = Number(v.age) - lastVisitWeight[v.batchId].age;
            if (daysDiff > 0 && weightDiff > 0) adwg = Number((weightDiff / daysDiff).toFixed(2));
        }
        lastVisitWeight[v.batchId] = { weight: Number(v.weight), age: Number(v.age) };

        return {
            'Farm': getFarmName(v.farmId), 'Farm Type': getFarmType(v.farmId), 'Batch': getBatchName(v.batchId), 'Record Date': v.date,
            'Age (Days)': Number(v.age), 'Age (Weeks)': Math.floor(Number(v.age) / 7), 'Birds Alive': Number(v.birdsAlive),
            'Period Mortality': Number(v.periodMortality) || 0, 'Cum. Mortality %': Number(v.mortalityPercent) || 0,
            'Avg Bird Weight (g)': Number(v.weight) || 0, 'ADWG (g/day)': adwg, 'Feed Type': v.feedType,
            'Period Feed Intake (kg)': Number(v.feedQty) || 0, 'Cumulative Feed (kg)': Number(v.cumulativeFeed) || 0,
            'FCR (Feed Conv. Ratio)': Number(v.fcr) || null, 'Environment Temp (°C)': Number(v.temperature) || null,
            'Environment Humidity (%)': Number(v.humidity) || null,
            'Daily Eggs (Layers)': v.layerData ? Number(v.layerData.dailyEggProduction) : null,
            'Laying Rate %': v.layerData && v.birdsAlive ? Number(((Number(v.layerData.dailyEggProduction) / v.birdsAlive) * 100).toFixed(2)) : null,
            'Egg Size': v.layerData?.eggSize || 'N/A', 'Peak Period': v.layerData?.isPeakPeriod ? 'Yes' : 'No'
        };
      });

      // Split Analytics into Farm Specific Tabs
      const broilerData = visitsSheetData.filter(v => v['Farm Type'] === 'Broiler');
      const layerData = visitsSheetData.filter(v => v['Farm Type'] === 'Layer');
      const breederData = visitsSheetData.filter(v => v['Farm Type'] === 'Breeder');

      if (broilerData.length > 0) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(broilerData), "Master Analytics - Broiler");
      if (layerData.length > 0) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(layerData), "Master Analytics - Layer");
      if (breederData.length > 0) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(breederData), "Master Analytics - Breeder");

      const healthSheet = window.XLSX.utils.json_to_sheet(sortedVisits.map(v => ({
        'Farm': getFarmName(v.farmId), 'Farm Type': getFarmType(v.farmId), 'Batch': getBatchName(v.batchId), 'Date': v.date,
        'Symptoms': v.symptoms || 'None', 'Diagnosis': v.diagnosis || 'None', 'Treatment': v.treatment || 'None',
        'Temp (°C)': Number(v.temperature) || null, 'Humidity (%)': Number(v.humidity) || null,
        'Egg Quality': v.layerData?.eggQuality || 'N/A', 'Vent Prolapse': v.layerData?.layerIssues?.prolapse ? 'Yes' : 'No',
        'Cannibalism': v.layerData?.layerIssues?.cannibalism ? 'Yes' : 'No',
        'Necropsy Examined': Number(v.necropsy?.examined) || 0,
        'Lesions': Object.entries(v.necropsy?.lesions || {}).filter(([_, val]) => val).map(([k, _]) => k).join(', '),
        'Cloud Image URLs': v.necropsy?.images?.join(', ') || 'No Images', 'Notes': v.remarks || ''
      })));
      window.XLSX.utils.book_append_sheet(wb, healthSheet, "4. Health Log");

      const guideSheet = window.XLSX.utils.json_to_sheet([
          { "INSTRUCTIONS FOR CHARTS & GRAPHS": "To instantly create growth curves, FCR charts, or temperature correlation graphs:" },
          { "INSTRUCTIONS FOR CHARTS & GRAPHS": "1. Go to the relevant 'Master Analytics' sheet (Broiler/Layer/Breeder)." },
          { "INSTRUCTIONS FOR CHARTS & GRAPHS": "2. Click any cell inside the data table." },
          { "INSTRUCTIONS FOR CHARTS & GRAPHS": "3. On the Excel Ribbon, click 'Insert' -> 'PivotChart'." },
          { "INSTRUCTIONS FOR CHARTS & GRAPHS": "4. Drag 'Age (Days)' to the Axis (Categories) box." },
          { "INSTRUCTIONS FOR CHARTS & GRAPHS": "5. Drag 'Avg Bird Weight (g)' and 'FCR' to the Values box to instantly see your growth curves!" }
      ]);
      guideSheet['!cols'] = [{ wch: 120 }];
      window.XLSX.utils.book_append_sheet(wb, guideSheet, "Charting Guide");

      window.XLSX.writeFile(wb, `SWIFT_Data_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast("Longitudinal Data Exported", "success");
    } catch (error) {
      console.error("Export error:", error);
      showToast("Failed to export report", "error");
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-[#298fbe] text-white font-semibold text-lg">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-white flex justify-center print:bg-white print:text-black">
      <div className="w-full max-w-md bg-gradient-to-br from-[#38a3d1] to-[#1d73a5] min-h-screen shadow-2xl relative flex flex-col pb-16 overflow-hidden print:bg-none print:shadow-none print:max-w-none print:pb-0 print:border-0">
        
        {/* Header - Modern Glassmorphic Blue with Yellow Title */}
        <header className="px-5 py-4 shadow-lg flex justify-between items-center z-20 sticky top-0 bg-gradient-to-r from-[#1d73a5]/95 to-[#298fbe]/95 backdrop-blur-xl border-b border-white/20 print:hidden">
          <div className="flex items-center gap-3">
            {view.name !== 'dashboard' && (
              <button onClick={() => navigate('dashboard')} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors backdrop-blur-md shadow-sm border border-white/20">
                <ChevronLeft size={20} className="text-white" />
              </button>
            )}
            {view.name === 'dashboard' && (
              <div className="relative">
                <img src={CUSTOM_LOGO_URL} alt="Logo" className="w-11 h-11 rounded-xl border-2 border-white/30 object-cover shadow-md bg-white/50" />
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#1d73a5] rounded-full shadow-sm"></div>
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="font-black text-[18px] tracking-wide truncate text-[#FFDF00] drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)] leading-tight">
                SWIFT®️ Poultry Tracker
              </h1>
              {view.name !== 'dashboard' && (
                <span className="text-[10px] uppercase tracking-widest text-white/80 font-bold mt-0.5">
                  {view.name === 'farms' && 'Farm Directory'}
                  {view.name === 'addFarm' && 'Register Farm'}
                  {view.name === 'farmDetails' && 'Farm Details'}
                  {view.name === 'addBatch' && 'New Batch'}
                  {view.name === 'addVisit' && 'Farm Visit Record'}
                  {view.name === 'closeBatch' && 'Record Batch Sale'}
                  {view.name === 'batchAnalytics' && 'Scientific Report'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isOnline ? (
              <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm border border-white/10 shadow-sm"><Wifi size={16} className="text-white/90" /></div>
            ) : (
              <div className="bg-red-500/20 p-2 rounded-xl backdrop-blur-sm border border-red-500/30 shadow-sm"><WifiOff size={16} className="text-red-400" /></div>
            )}
          </div>
        </header>

        {/* Dynamic Content Area */}
        <main className="flex-1 overflow-y-auto p-4 relative z-0 print:p-0 print:overflow-visible">
          {!user ? (
             <div className="text-center mt-20 p-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl mx-4">
                 <Activity size={48} className="mx-auto text-white/90 mb-4" />
                 <h2 className="text-xl font-bold mb-2 text-[#FFDF00] drop-shadow-sm">Welcome to SWIFT Tracker</h2>
                 <p className="text-white/70 text-sm">Please log in to manage farms.</p>
                 <button className="w-full mt-6 bg-white text-[#1d73a5] p-3 rounded-lg font-bold shadow-lg hover:bg-sky-50 transition-colors" onClick={() => window.location.reload()}>Login / Refresh</button>
             </div>
          ) : (
            <>
              {view.name === 'dashboard' && <DashboardView farms={farms} batches={batches} visits={visits} onNavigate={navigate} />}
              {view.name === 'farms' && <FarmsView farms={farms} onNavigate={navigate} />}
              {view.name === 'addFarm' && <AddFarmView user={user} onNavigate={navigate} showToast={showToast} />}
              {view.name === 'farmDetails' && <FarmDetailsView farm={view.params.farm} batches={batches} visits={visits} onNavigate={navigate} />}
              {view.name === 'addBatch' && <AddBatchView farm={view.params.farm} user={user} onNavigate={navigate} showToast={showToast} />}
              {view.name === 'addVisit' && <AddVisitView batch={view.params.batch} farm={view.params.farm} visits={visits} user={user} onNavigate={navigate} showToast={showToast} storage={storage} appId={appId} />}
              {view.name === 'closeBatch' && <CloseBatchView batch={view.params.batch} farm={view.params.farm} user={user} onNavigate={navigate} showToast={showToast} />}
              {view.name === 'batchAnalytics' && <BatchAnalyticsView batch={view.params.batch} farm={view.params.farm} visits={visits} onNavigate={navigate} showToast={showToast} />}
            </>
          )}
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 w-full max-w-md bg-[#1d73a5]/95 backdrop-blur-md border-t border-white/20 flex justify-around py-3 z-20 text-xs font-medium text-white/60 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] pb-safe print:hidden">
          <button onClick={() => navigate('dashboard')} className={`flex flex-col items-center gap-1.5 flex-1 transition-colors ${view.name === 'dashboard' ? 'text-white font-bold' : 'hover:text-white/80'}`}>
            <Home size={20} /><span>Home</span>
          </button>
          <button onClick={() => navigate('farms')} className={`flex flex-col items-center gap-1.5 flex-1 transition-colors ${view.name.includes('farm') ? 'text-white font-bold' : 'hover:text-white/80'}`}>
            <MapPin size={20} /><span>Farms</span>
          </button>
          <button onClick={handleExport} className="flex flex-col items-center gap-1.5 flex-1 hover:text-white/80 transition-colors">
            <FileSpreadsheet size={20} /><span>Export</span>
          </button>
        </nav>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </div>
  );
}

// --- VIEWS ---

const DashboardView = ({ farms, batches, visits, onNavigate }) => {
  const activeBatchesList = batches.filter(b => b.active);
  const totalBirds = activeBatchesList.reduce((acc, b) => acc + Number(b.chicksPlaced), 0);

  // --- Smart Recommendation Engine ---
  const today = getLocalYYYYMMDD();
  const recommendations = activeBatchesList.map(batch => {
    const farm = farms.find(f => f.id === batch.farmId);
    const batchVisits = visits.filter(v => v.batchId === batch.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastVisitDate = batchVisits.length > 0 ? batchVisits[0].date : batch.arrivalDate;
    const daysSince = getDaysBetween(lastVisitDate, today);

    return { farm, batch, daysSince, lastVisitDate };
  }).filter(rec => rec.farm) 
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 4); 

  const getUrgencyColor = (days) => {
    if (days >= 7) return 'text-red-400';
    if (days >= 4) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  return (
    <div className="space-y-6 pb-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-white/20 flex flex-col justify-center items-center hover:bg-white/15 transition-colors">
          <div className="bg-white/20 p-2.5 rounded-full mb-2"><Home size={20} className="text-white" /></div>
          <span className="text-2xl font-bold text-white">{farms.length}</span>
          <span className="text-xs text-white/80 mt-0.5">Total Farms</span>
        </div>
        <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-white/20 flex flex-col justify-center items-center hover:bg-white/15 transition-colors">
          <div className="bg-white/20 p-2.5 rounded-full mb-2"><Activity size={20} className="text-white" /></div>
          <span className="text-2xl font-bold text-white">{activeBatchesList.length}</span>
          <span className="text-xs text-white/80 mt-0.5">Active Batches</span>
        </div>
      </div>

      <div className="bg-white/15 backdrop-blur-md rounded-xl p-6 text-white shadow-lg border border-white/30 relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-sm font-medium text-white/90 mb-1">Current Placement</h3>
          <p className="text-4xl font-bold mb-4 tracking-tight">{totalBirds.toLocaleString()} <span className="text-lg font-normal text-white/80">Birds</span></p>
          <div className="flex gap-4 text-sm border-t border-white/20 pt-4">
            <div>
              <p className="text-white/70 text-xs uppercase tracking-wide">Total Logged Visits</p>
              <p className="font-bold text-lg">{visits.length}</p>
            </div>
          </div>
        </div>
        <Activity size={120} className="absolute -right-4 -bottom-6 text-white/10" />
      </div>

      {recommendations.length > 0 && (
        <div>
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Calendar size={18} className="text-[#FFDF00]" /> Recommended Visits
          </h3>
          <div className="space-y-3">
            {recommendations.map((rec, idx) => (
              <div key={idx} onClick={() => onNavigate('farmDetails', { farm: rec.farm })} className="bg-white/10 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-white/20 flex items-center justify-between hover:bg-white/20 active:scale-[0.98] cursor-pointer transition-all">
                <div>
                  <h4 className="font-bold text-white text-[15px]">{rec.farm.name}</h4>
                  <p className="text-xs text-white/70 mt-0.5">{rec.batch.name}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className={`text-xl font-black leading-none ${getUrgencyColor(rec.daysSince)}`}>{rec.daysSince}</span>
                  <span className="text-[9px] uppercase tracking-wider text-white/60 font-bold mt-1">Days Ago</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('addFarm')} className="bg-white/10 backdrop-blur-sm border border-white/20 p-3.5 rounded-xl flex items-center gap-3 shadow-sm hover:bg-white/20 active:scale-95 transition-all">
            <div className="bg-white/20 text-white p-2 rounded-lg"><Plus size={18} /></div>
            <span className="text-sm font-medium text-white">Add Farm</span>
          </button>
          <button onClick={() => onNavigate('farms')} className="bg-white/10 backdrop-blur-sm border border-white/20 p-3.5 rounded-xl flex items-center gap-3 shadow-sm hover:bg-white/20 active:scale-95 transition-all">
            <div className="bg-white/20 text-white p-2 rounded-lg"><MapPin size={18} /></div>
            <span className="text-sm font-medium text-white">View Farms</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const FarmsView = ({ farms, onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAndSortedFarms = farms
    .filter(farm => {
      const query = searchQuery.toLowerCase();
      return (
        farm.name.toLowerCase().includes(query) ||
        farm.district.toLowerCase().includes(query) ||
        farm.municipality.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-bold text-white text-lg">Farm Directory</h2>
        <button onClick={() => onNavigate('addFarm')} className="text-white font-medium text-xs flex items-center gap-1 bg-white/20 border border-white/30 px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors shadow-sm">
          <Plus size={14} /> New Farm
        </button>
      </div>

      {farms.length > 0 && (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search size={16} className="text-white/50" />
          </div>
          <input
            type="text"
            placeholder="Search by name, district, or area..."
            className="w-full border border-white/30 p-3.5 pl-10 rounded-xl bg-white/10 text-white placeholder-white/60 focus:bg-white/20 focus:border-white text-sm outline-none transition-all shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {farms.length === 0 ? (
        <div className="text-center py-10 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 shadow-sm">
          <MapPin size={40} className="mx-auto text-white/50 mb-3" />
          <p className="text-white/80 text-sm">No farms registered yet.</p>
        </div>
      ) : filteredAndSortedFarms.length === 0 ? (
        <div className="text-center py-10 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 shadow-sm">
          <Search size={40} className="mx-auto text-white/50 mb-3" />
          <p className="text-white/80 text-sm">No farms match your search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedFarms.map(farm => (
            <div key={farm.id} onClick={() => onNavigate('farmDetails', { farm })} className="bg-white/10 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-white/20 flex items-center justify-between active:bg-white/20 cursor-pointer transition-colors hover:bg-white/15">
              <div>
                <h3 className="font-bold text-white text-[15px]">{farm.name}</h3>
                <p className="text-xs text-white/70 mt-1">{farm.district}, {farm.municipality}</p>
                <span className="inline-block mt-2 text-[10px] uppercase font-bold tracking-wider text-[#1d73a5] bg-white px-2 py-0.5 rounded-md shadow-sm">{farm.type}</span>
              </div>
              <ChevronLeft size={20} className="text-white/50 rotate-180" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AddFarmView = ({ user, onNavigate, showToast }) => {
  const [formData, setFormData] = useState({
    name: '', owner: '', phone: '', district: '', municipality: '', ward: '', type: 'Broiler', lat: null, lng: null
  });
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [isCustomMun, setIsCustomMun] = useState(false);
  
  const [districtQuery, setDistrictQuery] = useState('');
  const [isDistrictOpen, setIsDistrictOpen] = useState(false);
  const districtRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (districtRef.current && !districtRef.current.contains(event.target)) {
        setIsDistrictOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const captureLocation = () => {
    setLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({ ...prev, lat: position.coords.latitude, lng: position.coords.longitude }));
          setLocating(false);
          showToast("Location captured successfully", "success");
        },
        (error) => {
          setLocating(false);
          showToast("Failed to get location. Check permissions.", "error");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocating(false);
      showToast("Geolocation is not supported by your browser", "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.district) {
        showToast("Please select a District from the dropdown", "error");
        return;
    }
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'farms'), {
        ...formData, createdAt: serverTimestamp()
      });
      showToast("Farm registered successfully", "success");
      onNavigate('farmDetails', { farm: { id: docRef.id, ...formData } });
    } catch (error) {
      console.error(error);
      showToast("Error adding farm", "error");
    }
    setLoading(false);
  };

  const handleMunicipalityChange = (e) => {
    if (e.target.value === 'CUSTOM_OTHER') {
       setIsCustomMun(true);
       setFormData({ ...formData, municipality: '' });
    } else {
       setFormData({ ...formData, municipality: e.target.value });
    }
  };

  const filteredDistricts = Object.keys(nepalLocations).filter(d => d.toLowerCase().includes(districtQuery.toLowerCase()));

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-10">
      <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-sm border border-white/20 space-y-4">
        <h3 className="font-bold text-white border-b border-white/20 pb-2">Farm Details</h3>
        <input required type="text" placeholder="Farm Name" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white placeholder-white/60 focus:bg-white/20 focus:border-white focus:ring-1 focus:ring-white text-sm transition-all outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
        <input required type="text" placeholder="Owner Name" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white placeholder-white/60 focus:bg-white/20 focus:border-white focus:ring-1 focus:ring-white text-sm transition-all outline-none" value={formData.owner} onChange={e => setFormData({...formData, owner: e.target.value})} />
        <input required type="tel" placeholder="Phone Number" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white placeholder-white/60 focus:bg-white/20 focus:border-white focus:ring-1 focus:ring-white text-sm transition-all outline-none" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
        
        <select className="w-full border border-white/30 p-3.5 rounded-lg bg-[#2a8cbd] text-white focus:border-white text-sm outline-none shadow-sm" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
          <option className="text-slate-800 bg-white" value="Broiler">Broiler</option>
          <option className="text-slate-800 bg-white" value="Layer">Layer</option>
          <option className="text-slate-800 bg-white" value="Breeder">Breeder</option>
        </select>
      </div>

      <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-sm border border-white/20 space-y-4">
        <h3 className="font-bold text-white border-b border-white/20 pb-2">Location Setup</h3>
        
        <div className="grid grid-cols-2 gap-3 relative" ref={districtRef}>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={14} className="text-white/50" />
             </div>
             <input 
                type="text" 
                placeholder="Search District..." 
                className="w-full border border-white/30 p-3.5 pl-9 rounded-lg bg-white/10 text-white placeholder-white/60 focus:bg-white/20 focus:border-white text-sm outline-none transition-all"
                value={districtQuery}
                onFocus={() => setIsDistrictOpen(true)}
                onChange={(e) => {
                  setDistrictQuery(e.target.value);
                  setIsDistrictOpen(true);
                  setFormData({...formData, district: '', municipality: ''});
                  setIsCustomMun(false);
                }}
             />
             {isDistrictOpen && (
               <ul className="absolute z-50 w-[200%] sm:w-full mt-1 max-h-48 overflow-y-auto bg-[#1d73a5] border border-white/30 rounded-lg shadow-2xl backdrop-blur-xl">
                 {filteredDistricts.length > 0 ? filteredDistricts.map(dist => (
                   <li 
                      key={dist} 
                      className="p-3 hover:bg-white/20 cursor-pointer text-sm text-white font-medium border-b border-white/10 last:border-0"
                      onClick={() => {
                        setDistrictQuery(dist);
                        setFormData({...formData, district: dist, municipality: ''});
                        setIsDistrictOpen(false);
                      }}
                   >
                     {dist}
                   </li>
                 )) : (
                   <li className="p-3 text-sm text-white/50">No matches found.</li>
                 )}
               </ul>
             )}
          </div>
          
          {!isCustomMun ? (
            <select required className={`w-full border border-white/30 p-3.5 rounded-lg text-white focus:border-white text-sm outline-none shadow-sm transition-all ${formData.district ? 'bg-[#2a8cbd]' : 'bg-white/10 text-white/50 cursor-not-allowed'}`} value={formData.municipality} onChange={handleMunicipalityChange} disabled={!formData.district}>
              <option value="" disabled className="text-slate-800 bg-white">Municipality</option>
              {formData.district && nepalLocations[formData.district].sort().map(mun => (
                <option key={mun} value={mun} className="text-slate-800 bg-white">{mun}</option>
              ))}
              <option value="CUSTOM_OTHER" className="text-[#1d73a5] font-bold bg-white">+ Type Manually...</option>
            </select>
          ) : (
            <div className="relative">
              <input required type="text" placeholder="Type Municipality" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white placeholder-white/60 focus:bg-white/20 focus:border-white text-sm outline-none transition-all pr-8" value={formData.municipality} onChange={e => setFormData({...formData, municipality: e.target.value})} autoFocus />
              <button type="button" onClick={() => setIsCustomMun(false)} className="absolute right-2 top-3 text-white/50 hover:text-white"><Edit2 size={14}/></button>
            </div>
          )}
        </div>
        
        <select required className={`w-full border border-white/30 p-3.5 rounded-lg text-white focus:border-white text-sm outline-none shadow-sm transition-all ${formData.ward ? 'bg-[#2a8cbd]' : 'bg-white/10'}`} value={formData.ward} onChange={e => setFormData({...formData, ward: e.target.value})}>
          <option value="" disabled className="text-slate-800 bg-white">Ward No.</option>
          {Array.from({ length: 35 }, (_, i) => i + 1).map(w => (
             <option key={w} value={w} className="text-slate-800 bg-white">{w}</option>
          ))}
        </select>
        
        <div className="pt-2">
          <button type="button" onClick={captureLocation} disabled={locating} className={`w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all shadow-sm ${formData.lat ? 'bg-white/20 text-white border border-white/50' : 'bg-white/10 text-white border border-white/30 hover:bg-white/20'}`}>
            <MapPin size={18} />
            {locating ? 'Capturing...' : formData.lat ? 'Location Captured ✓' : 'Capture GPS Location'}
          </button>
          {formData.lat && <p className="text-center text-[10px] text-white/80 mt-2 font-mono bg-white/10 py-1 rounded-md">{formData.lat.toFixed(5)}, {formData.lng.toFixed(5)}</p>}
        </div>
      </div>

      <button type="submit" disabled={loading} className="w-full bg-white text-[#1d73a5] p-4 rounded-xl font-bold shadow-lg hover:bg-sky-50 active:scale-95 transition-all text-base uppercase tracking-wide">
        {loading ? 'Saving...' : 'Save Farm'}
      </button>
    </form>
  );
};

const FarmDetailsView = ({ farm, batches, visits, onNavigate }) => {
  const farmBatches = batches.filter(b => b.farmId === farm.id);

  const handleNavigation = () => {
    if (farm.lat && farm.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${farm.lat},${farm.lng}`, '_blank');
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="bg-white/15 backdrop-blur-md p-6 rounded-xl shadow-lg border border-white/30 relative overflow-hidden">
        <div className="flex justify-between items-start mb-3">
          <h2 className="text-2xl font-bold text-white tracking-tight">{farm.name}</h2>
          <span className="bg-white text-[#1d73a5] text-[10px] px-2.5 py-1 rounded-md font-bold tracking-wider shadow-sm">{farm.type}</span>
        </div>
        <div className="text-sm text-white/80 space-y-1.5 font-medium">
          <p className="flex items-center gap-2"><User size={14} className="text-white/60"/> {farm.owner} • {farm.phone}</p>
          <p className="flex items-center gap-2"><MapPin size={14} className="text-white/60"/> {farm.municipality}-{farm.ward}, {farm.district}</p>
        </div>

        {farm.lat && farm.lng ? (
          <button onClick={handleNavigation} className="mt-5 w-full bg-white/20 hover:bg-white/30 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-white/40 shadow-sm uppercase tracking-wider">
            <Navigation size={16} className="animate-pulse" /> Launch GPS Navigation
          </button>
        ) : (
           <div className="mt-4 p-2.5 bg-white/5 border border-white/10 rounded-xl text-center text-xs text-white/60">
              No GPS coordinates saved for navigation.
           </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-white text-lg">Batches</h3>
          <button onClick={() => onNavigate('addBatch', { farm })} className="text-white bg-white/20 border border-white/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-white/30 transition-colors shadow-sm">
            <Plus size={14} /> Add Batch
          </button>
        </div>

        {farmBatches.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-sm p-8 rounded-xl border border-white/20 text-center shadow-sm">
            <p className="text-white/80 text-sm mb-4 font-medium">No batches added yet.</p>
            <button onClick={() => onNavigate('addBatch', { farm })} className="bg-white text-[#1d73a5] px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-sky-50 transition-all">Create First Batch</button>
          </div>
        ) : (
          <div className="space-y-4">
            {farmBatches.map(batch => {
              const batchVisits = visits.filter(v => v.batchId === batch.id);
              const currentAge = getDaysBetween(batch.arrivalDate, getLocalYYYYMMDD());

              return (
                <div key={batch.id} className="bg-white/10 backdrop-blur-md rounded-xl shadow-lg border border-white/20 overflow-hidden relative transition-all">
                  {batch.active && <div className="absolute top-0 left-0 w-1.5 h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>}
                  <div className="p-5 pl-6">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-white flex items-center gap-2 text-lg">
                          {batch.name}
                          {batch.active ? <span className="bg-white/20 border border-white/40 text-white text-[10px] px-2 py-0.5 rounded-md font-bold tracking-widest shadow-sm">ACTIVE</span> : <span className="bg-black/20 border border-white/10 text-white/60 text-[10px] px-2 py-0.5 rounded-md font-bold tracking-widest">CLOSED</span>}
                        </h4>
                        <p className="text-xs text-white/70 mt-1.5 font-medium">Arrived: {batch.arrivalDate} • {batch.chicksPlaced} chicks</p>
                      </div>
                      
                      <button onClick={() => onNavigate('batchAnalytics', { farm, batch })} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/20" title="Scientific Report">
                        <BarChart2 size={18} className="text-[#FFDF00]" />
                      </button>
                    </div>
                    
                    <div className="mt-4 flex gap-3">
                      <div className="flex-1 bg-black/10 border border-white/10 p-3 rounded-xl text-center shadow-inner">
                        <span className="block text-[10px] text-white/70 uppercase font-bold tracking-wider mb-1">{batch.active ? "Current Age" : "Sold Date"}</span>
                        <span className="font-bold text-white text-base">{batch.active ? `${currentAge} days` : batch.soldDate}</span>
                      </div>
                      <div className="flex-1 bg-black/10 border border-white/10 p-3 rounded-xl text-center shadow-inner">
                        <span className="block text-[10px] text-white/70 uppercase font-bold tracking-wider mb-1">Visits</span>
                        <span className="font-bold text-white text-base">{batchVisits.length}</span>
                      </div>
                    </div>

                    {batch.active && (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button onClick={() => onNavigate('addVisit', { farm, batch })} className="w-full bg-white/20 hover:bg-white/30 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-white/40 shadow-sm uppercase tracking-wide">
                          <Activity size={14} /> Log Visit
                        </button>
                        <button onClick={() => onNavigate('closeBatch', { farm, batch })} className="w-full bg-[#15567b] hover:bg-[#104360] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-inner uppercase tracking-wide border border-black/10">
                          <PackageCheck size={14} /> Sell Batch
                        </button>
                      </div>
                    )}
                    
                    <button onClick={() => onNavigate('batchAnalytics', { farm, batch })} className="mt-3 w-full bg-[#FFDF00]/10 hover:bg-[#FFDF00]/20 text-[#FFDF00] py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-[#FFDF00]/30 shadow-sm uppercase tracking-wide">
                      <TrendingUp size={14} /> View Analytics & Report
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const BatchAnalyticsView = ({ farm, batch, visits, onNavigate, showToast }) => {
  const [isSharing, setIsSharing] = useState(false);
  const batchVisits = visits.filter(v => v.batchId === batch.id).sort((a,b) => Number(a.age) - Number(b.age));
  
  if (batchVisits.length === 0) {
    return (
      <div className="text-center py-16 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 shadow-sm mx-4">
        <Activity size={48} className="mx-auto text-white/50 mb-4" />
        <p className="text-white/80 text-sm">Insufficient data points to generate Scientific Report.</p>
      </div>
    );
  }

  const lastVisit = batchVisits[batchVisits.length - 1];
  const initialBirds = Number(batch.chicksPlaced);
  const currentBirds = Number(lastVisit.birdsAlive) || initialBirds;
  const currentWeight = Number(lastVisit.weight) || 0;
  const maxAge = Number(lastVisit.age) || 1;
  const adwg = maxAge > 0 ? (currentWeight / maxAge).toFixed(2) : 0;
  
  const fcrData = batchVisits.filter(v => v.fcr);
  const currentFcr = fcrData.length > 0 ? fcrData[fcrData.length - 1].fcr : '--';

  const layingPercentage = farm.type === 'Layer' && lastVisit.layerData && currentBirds > 0 ? ((Number(lastVisit.layerData.dailyEggProduction) / currentBirds) * 100).toFixed(1) : null;

  let insights = [];
  if (farm.type === 'Broiler') {
      if (adwg > 45) insights.push("Growth velocity is exceptional (ADWG > 45g/day). Feed formulation is performing optimally.");
      else if (adwg < 30) insights.push("Growth velocity is suboptimal (ADWG < 30g/day). Consider reviewing protein/energy density in current feed formulation.");
      
      if (Number(currentFcr) > 1.8) insights.push("FCR is trending high (> 1.8). Review feed wastage, environmental temp, or potential subclinical disease.");
      else if (Number(currentFcr) < 1.5 && Number(currentFcr) > 0) insights.push("Excellent Feed Conversion Ratio (< 1.5). Economic efficiency is high.");
  } else if (farm.type === 'Layer') {
      if (layingPercentage && Number(layingPercentage) > 90) insights.push("Peak laying efficiency confirmed (>90%). Maintain current calcium and energy levels.");
      else if (layingPercentage && Number(layingPercentage) < 70 && maxAge > 150) insights.push("Laying rate is below 70%. Evaluate light stimulation protocol, calcium intake, and water quality.");
  }
  
  if (lastVisit.mortalityPercent > 5) insights.push("Cumulative mortality exceeds standard thresholds (>5%). Review recent necropsy logs for intervention.");

  const handleShare = async () => {
    if (isSharing) return;
    if (navigator.share) {
      setIsSharing(true);
      try {
        await navigator.share({
          title: `SWIFT Report: ${farm.name} - ${batch.name}`,
          text: `Farm Performance Report for ${farm.name} (${batch.name}).\nType: ${farm.type}\nCurrent Age: ${maxAge} Days\nMortality: ${lastVisit.mortalityPercent}%\nFCR: ${currentFcr}\nADWG: ${adwg}g/day\n\nGenerated via SWIFT®️ Poultry Tracker.`,
        });
      } catch (err) { 
        console.error('Share failed', err); 
      } finally {
        setIsSharing(false);
      }
    } else {
      showToast("Native sharing not supported on this browser.", "info");
    }
  };

  return (
    <div className="space-y-4 pb-10 animate-fade-in print:bg-white print:text-black print:space-y-6 print:p-8">
      
      {/* Web Buttons (Hidden in Print) */}
      <div className="flex justify-end gap-3 print:hidden px-1">
        <button onClick={handleShare} disabled={isSharing} className={`bg-white/20 hover:bg-white/30 text-white p-2 rounded-full backdrop-blur-md shadow-sm border border-white/20 transition-all ${isSharing ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <Share2 size={18} />
        </button>
        <button onClick={() => window.print()} className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-full backdrop-blur-md shadow-sm border border-white/20 transition-all">
          <Printer size={18} />
        </button>
      </div>

      {/* Print-Only Header Block */}
      <div className="hidden print:flex justify-between items-center border-b-2 border-gray-300 pb-4 mb-8">
         <div className="flex items-center gap-4">
           <img src={CUSTOM_LOGO_URL} alt="Logo" className="w-16 h-16 object-contain rounded" />
           <div>
             <h1 className="text-2xl font-black text-gray-900">SWIFT®️ Poultry Tracker</h1>
             <h2 className="text-lg font-bold text-gray-700">Scientific Batch Report</h2>
           </div>
         </div>
         <div className="text-right text-sm text-gray-600 font-medium space-y-0.5">
           <p>Farm: <strong className="text-gray-900">{farm.name}</strong></p>
           <p>Batch: <strong className="text-gray-900">{batch.name}</strong></p>
           <p>Type: {farm.type}</p>
           <p>Date: {getLocalYYYYMMDD()}</p>
         </div>
      </div>

      <div className="bg-white/10 backdrop-blur-md text-white -mx-4 -mt-4 p-5 pb-6 mb-2 rounded-b-2xl shadow-sm border-b border-white/20 print:mx-0 print:mt-0 print:p-0 print:bg-transparent print:border-none print:shadow-none print:rounded-none">
        <h2 className="font-bold text-xl tracking-tight text-[#FFDF00] print:hidden">{farm.name}</h2>
        <p className="text-white/80 text-sm font-medium mt-1 print:hidden">{batch.name} • Scientific Analytics</p>
      </div>

      <div className="bg-white/15 backdrop-blur-md p-5 rounded-xl shadow-lg border border-white/30 relative overflow-hidden print:bg-gray-50 print:border-gray-300 print:shadow-none print:p-4">
        <h3 className="font-bold text-white print:text-gray-800 mb-4 uppercase tracking-widest text-[11px] border-b border-white/20 print:border-gray-300 pb-2">Key Performance Indicators</h3>
        <div className="grid grid-cols-2 gap-3 print:gap-4">
          <div className="bg-black/10 border border-white/10 p-3 rounded-xl shadow-inner print:bg-white print:border-gray-200 print:shadow-none">
            <span className="block text-[9px] text-white/70 print:text-gray-500 uppercase font-bold tracking-wider mb-1">ADWG</span>
            <span className="font-black text-white print:text-gray-900 text-lg">{adwg} <span className="text-xs font-normal opacity-80 print:text-gray-500">g/day</span></span>
          </div>
          <div className="bg-black/10 border border-white/10 p-3 rounded-xl shadow-inner print:bg-white print:border-gray-200 print:shadow-none">
            <span className="block text-[9px] text-white/70 print:text-gray-500 uppercase font-bold tracking-wider mb-1">Final FCR</span>
            <span className="font-black text-white print:text-gray-900 text-lg">{currentFcr}</span>
          </div>
          <div className="bg-black/10 border border-white/10 p-3 rounded-xl shadow-inner print:bg-white print:border-gray-200 print:shadow-none">
            <span className="block text-[9px] text-white/70 print:text-gray-500 uppercase font-bold tracking-wider mb-1">Total Feed</span>
            <span className="font-black text-white print:text-gray-900 text-lg">{Number(lastVisit.cumulativeFeed).toFixed(0)} <span className="text-xs font-normal opacity-80 print:text-gray-500">kg</span></span>
          </div>
          <div className="bg-black/10 border border-white/10 p-3 rounded-xl shadow-inner print:bg-white print:border-gray-200 print:shadow-none">
            <span className="block text-[9px] text-white/70 print:text-gray-500 uppercase font-bold tracking-wider mb-1">Total Mortality</span>
            <span className="font-black text-white print:text-gray-900 text-lg">{lastVisit.mortalityPercent}<span className="text-xs font-normal opacity-80 print:text-gray-500">%</span></span>
          </div>
          {farm.type === 'Layer' && layingPercentage && (
             <div className="bg-black/10 border border-white/10 p-3 rounded-xl shadow-inner col-span-2 text-center print:bg-white print:border-gray-200 print:shadow-none">
               <span className="block text-[9px] text-white/70 print:text-gray-500 uppercase font-bold tracking-wider mb-1">Current Laying Rate</span>
               <span className="font-black text-[#FFDF00] print:text-blue-600 text-xl">{layingPercentage}<span className="text-sm font-normal opacity-80">%</span></span>
             </div>
          )}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-md p-5 rounded-xl shadow-lg border border-white/20 print:bg-white print:border-none print:shadow-none print:p-0 mt-6">
         <h3 className="font-bold text-white print:text-gray-800 mb-2 uppercase tracking-widest text-[11px] border-b border-white/20 print:border-gray-300 pb-2">Longitudinal Curves</h3>
         
         <div className="mt-4 pb-4 border-b border-white/10 print:border-gray-200">
           <LineChart data={batchVisits} xKey="age" yKey="weight" color="#FFDF00" label="Growth Curve (Weight)" unit="g" />
         </div>
         
         {fcrData.length > 0 && (
           <div className="mt-4 pb-4 border-b border-white/10 print:border-gray-200">
             <LineChart data={fcrData} xKey="age" yKey="fcr" color="#4ade80" label="FCR Trend" unit="" />
           </div>
         )}

         <div className="mt-4 pb-2">
           <LineChart data={batchVisits} xKey="age" yKey="mortalityPercent" color="#f87171" label="Cumulative Mortality" unit="%" />
         </div>
      </div>

      <div className="bg-[#1d73a5] p-5 rounded-xl shadow-lg border border-white/30 print:bg-gray-100 print:border-gray-300 print:shadow-none print:break-inside-avoid mt-6">
        <h3 className="font-bold text-[#FFDF00] print:text-gray-900 mb-3 flex items-center gap-2 uppercase tracking-widest text-[11px] border-b border-white/20 print:border-gray-300 pb-2">
          <Activity size={16} className="print:hidden" /> Automated Feed / Action Insights
        </h3>
        {insights.length > 0 ? (
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="text-xs text-white print:text-gray-800 font-medium leading-relaxed flex items-start gap-2">
                <span className="text-[#FFDF00] print:text-blue-600 mt-0.5">•</span> {insight}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-white/80 print:text-gray-600 font-medium">Batch performance is within normal variance parameters. Continue standard protocols.</p>
        )}
      </div>

    </div>
  );
};

const AddBatchView = ({ farm, user, onNavigate, showToast }) => {
  const [formData, setFormData] = useState({
    name: `Batch ${new Date().getFullYear()}-${Math.floor(Math.random()*1000)}`,
    arrivalDate: getLocalYYYYMMDD(),
    chicksPlaced: '',
    breed: '',
    active: true
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'batches'), {
        ...formData,
        chicksPlaced: Number(formData.chicksPlaced), 
        farmId: farm.id,
        createdAt: serverTimestamp()
      });
      showToast("Batch created successfully", "success");
      onNavigate('farmDetails', { farm });
    } catch (error) { showToast("Error adding batch", "error"); }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20 space-y-4">
        <h3 className="font-bold text-white border-b border-white/20 pb-2">Batch Information</h3>
        
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Batch Name / ID</label>
          <input required type="text" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white placeholder-white/50 focus:bg-white/20 focus:border-white focus:ring-1 focus:ring-white text-sm outline-none transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
        </div>
        
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Chick Arrival Date</label>
          <input required type="date" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white focus:bg-white/20 focus:border-white text-sm outline-none transition-all" style={{colorScheme: 'dark'}} value={formData.arrivalDate} onChange={e => setFormData({...formData, arrivalDate: e.target.value})} />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Chicks Placed</label>
            <input required type="number" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white placeholder-white/50 focus:bg-white/20 focus:border-white text-sm outline-none transition-all font-bold" value={formData.chicksPlaced} onChange={e => setFormData({...formData, chicksPlaced: e.target.value})} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Breed/Strain</label>
            <input required type="text" placeholder="e.g. Cobb 500" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white placeholder-white/50 focus:bg-white/20 focus:border-white text-sm outline-none transition-all" value={formData.breed} onChange={e => setFormData({...formData, breed: e.target.value})} />
          </div>
        </div>
      </div>

      <button type="submit" disabled={loading} className="w-full bg-white text-[#1d73a5] p-4 rounded-xl font-bold shadow-lg hover:bg-sky-50 active:scale-95 transition-all text-base uppercase tracking-wide">
        {loading ? 'Saving...' : 'Start Batch'}
      </button>
    </form>
  );
};

const CloseBatchView = ({ farm, batch, user, onNavigate, showToast }) => {
  const [formData, setFormData] = useState({ soldDate: getLocalYYYYMMDD(), birdsSold: '', finalWeight: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'batches', batch.id), {
        active: false, soldDate: formData.soldDate, birdsSold: Number(formData.birdsSold), finalWeight: Number(formData.finalWeight), updatedAt: serverTimestamp()
      }, { merge: true });
      showToast("Batch Sold & Archived", "success");
      onNavigate('farmDetails', { farm });
    } catch (error) { showToast("Error closing batch", "error"); }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20 space-y-4">
        <div className="border-b border-white/20 pb-3 mb-2">
           <h3 className="font-bold text-white text-lg flex items-center gap-2"><PackageCheck size={20}/> Record Batch Sale</h3>
           <p className="text-white/70 text-xs mt-1">This will permanently archive the batch.</p>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Sale Date</label>
          <input required type="date" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white focus:bg-white/20 focus:border-white text-sm outline-none transition-all" style={{colorScheme: 'dark'}} value={formData.soldDate} onChange={e => setFormData({...formData, soldDate: e.target.value})} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Total Birds Sold</label>
            <input required type="number" placeholder="Qty" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white focus:bg-white/20 focus:border-white text-sm outline-none transition-all font-bold text-center" value={formData.birdsSold} onChange={e => setFormData({...formData, birdsSold: e.target.value})} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Final Avg Weight (g)</label>
            <input required type="number" placeholder="Grams" className="w-full border border-white/30 p-3.5 rounded-lg bg-white/10 text-white focus:bg-white/20 focus:border-white text-sm outline-none transition-all font-bold text-center" value={formData.finalWeight} onChange={e => setFormData({...formData, finalWeight: e.target.value})} />
          </div>
        </div>
        {formData.birdsSold && formData.finalWeight && (
          <div className="mt-4 p-4 bg-black/10 rounded-xl border border-white/10 text-center">
             <p className="text-[10px] uppercase font-bold text-white/60 mb-1">Total Harvest Mass</p>
             <p className="font-black text-2xl text-white">{((Number(formData.birdsSold) * Number(formData.finalWeight))/1000).toLocaleString()} <span className="text-sm font-medium opacity-70">kg</span></p>
          </div>
        )}
      </div>
      <button type="submit" disabled={loading} className="w-full bg-red-500 hover:bg-red-400 text-white p-4 rounded-xl font-bold shadow-lg active:scale-95 transition-all text-base uppercase tracking-wide">
        {loading ? 'Processing...' : 'Confirm Sale & Close Batch'}
      </button>
    </form>
  );
};

const AddVisitView = ({ farm, batch, visits, user, onNavigate, showToast, storage, appId }) => {
  const [activeTab, setActiveTab] = useState('performance');
  
  const todayDate = getLocalYYYYMMDD();
  
  const batchVisits = visits.filter(v => v.batchId === batch.id).sort((a,b) => new Date(b.date) - new Date(a.date));
  const lastVisitDate = batchVisits.length > 0 ? batchVisits[0].date : batch.arrivalDate;
  const previousCumulativeMortality = batchVisits.reduce((acc, v) => acc + (Number(v.periodMortality) || Number(v.mortality) || 0), 0);
  const previousCumulativeFeed = batchVisits.reduce((acc, v) => acc + (Number(v.feedQty) || 0), 0);
  const initialBirds = Number(batch.chicksPlaced);

  const initialDaysSinceLast = Math.max(1, getDaysBetween(lastVisitDate, todayDate));

  const [formData, setFormData] = useState({
    date: todayDate,
    age: getDaysBetween(batch.arrivalDate, todayDate),
    daysSinceLastVisit: initialDaysSinceLast,
    mortality: '',
    weight: '',
    feedType: 'Starter',
    feedQty: '',
    symptoms: '', diagnosis: '', treatment: '', temperature: '', humidity: '', remarks: '',
    necropsy: { examined: '', lesions: { Liver: false, Intestine: false, Heart: false, Lungs: false, Bursa: false }, description: '', images: [] },
    layerData: { dailyEggProduction: '', eggSize: 'Medium', eggQuality: 'Normal', isPeakPeriod: false, layerIssues: { prolapse: false, cannibalism: false } }
  });

  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    const calcAge = getDaysBetween(batch.arrivalDate, newDate);
    const calcDaysSinceLast = Math.max(1, getDaysBetween(lastVisitDate, newDate));
    setFormData({ ...formData, date: newDate, age: calcAge, daysSinceLastVisit: calcDaysSinceLast });
  };

  const avgMortality = Number(formData.mortality) || 0;
  const computedPeriodMortality = avgMortality * formData.daysSinceLastVisit;
  
  const currentAlive = Math.max(0, initialBirds - previousCumulativeMortality - computedPeriodMortality);
  const totalMortalityNow = previousCumulativeMortality + computedPeriodMortality;
  const mortalityPercent = initialBirds > 0 ? ((totalMortalityNow / initialBirds) * 100).toFixed(2) : 0;
  
  const cumulativeFeedNow = previousCumulativeFeed + (Number(formData.feedQty) || 0);
  const weightKg = (Number(formData.weight) || 0) / 1000;
  const totalWeightKg = weightKg * currentAlive;
  const fcr = cumulativeFeedNow > 0 && totalWeightKg > 0 ? (cumulativeFeedNow / totalWeightKg).toFixed(2) : '--';

  const layingPercentage = currentAlive > 0 && formData.layerData.dailyEggProduction ? ((Number(formData.layerData.dailyEggProduction) / currentAlive) * 100).toFixed(1) : 0;

  const handleLesionChange = (organ) => {
    setFormData(prev => ({ ...prev, necropsy: { ...prev.necropsy, lesions: { ...prev.necropsy.lesions, [organ]: !prev.necropsy.lesions[organ] } } }));
  };

  const handleLayerChange = (field, value) => {
    setFormData(prev => ({ ...prev, layerData: { ...prev.layerData, [field]: value } }));
  };

  const handleLayerIssueChange = (issue) => {
    setFormData(prev => ({ ...prev, layerData: { ...prev.layerData, layerIssues: { ...prev.layerData.layerIssues, [issue]: !prev.layerData.layerIssues[issue] } } }));
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    showToast("Compressing for preview...", "info");
    try {
      const compressedImages = await Promise.all(files.map(file => compressImage(file)));
      setFormData(prev => ({ ...prev, necropsy: { ...prev.necropsy, images: [...prev.necropsy.images, ...compressedImages] } }));
    } catch (err) { showToast("Failed to process images", "error"); }
  };

  const removeImage = (index) => {
    setFormData(prev => {
      const newImages = [...prev.necropsy.images];
      newImages.splice(index, 1);
      return { ...prev, necropsy: { ...prev.necropsy, images: newImages } };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let uploadedImageUrls = [];
      if (formData.necropsy.images.length > 0) {
          showToast("Uploading media to cloud storage...", "info");
          for (let i = 0; i < formData.necropsy.images.length; i++) {
              const imgData = formData.necropsy.images[i];
              if (imgData.startsWith('data:image')) {
                  const imgRef = ref(storage, `artifacts/${appId}/users/${user.uid}/necropsy/${Date.now()}_${i}.jpg`);
                  await uploadString(imgRef, imgData, 'data_url');
                  const url = await getDownloadURL(imgRef);
                  uploadedImageUrls.push(url);
              } else {
                  uploadedImageUrls.push(imgData);
              }
          }
      }

      const cleanPayload = {
        date: formData.date,
        age: Number(formData.age),
        daysSinceLastVisit: Number(formData.daysSinceLastVisit),
        birdsAlive: currentAlive,
        mortality: Number(formData.mortality) || 0,
        periodMortality: computedPeriodMortality,
        weight: Number(formData.weight) || 0,
        feedType: formData.feedType,
        feedQty: Number(formData.feedQty) || 0,
        cumulativeFeed: cumulativeFeedNow,
        symptoms: formData.symptoms,
        diagnosis: formData.diagnosis,
        treatment: formData.treatment,
        temperature: formData.temperature ? Number(formData.temperature) : null,
        humidity: formData.humidity ? Number(formData.humidity) : null,
        remarks: formData.remarks,
        necropsy: { 
            ...formData.necropsy, 
            examined: Number(formData.necropsy.examined) || 0,
            images: uploadedImageUrls 
        }, 
        layerData: farm.type === 'Layer' ? {
            ...formData.layerData,
            dailyEggProduction: Number(formData.layerData.dailyEggProduction) || 0
        } : null,
        farmId: farm.id,
        batchId: batch.id,
        fcr: fcr !== '--' ? Number(fcr) : null,
        mortalityPercent: Number(mortalityPercent),
        createdAt: serverTimestamp(),
        syncStatus: 'Synced' 
      };

      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'visits'), cleanPayload);
      showToast("Visit recorded & synced to cloud", "success");
      onNavigate('farmDetails', { farm });
    } catch (error) {
      console.error(error);
      showToast("Error saving data. Retrying...", "error");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-10">
      <div className="bg-white/10 backdrop-blur-md text-white -mx-4 -mt-4 p-5 pb-6 mb-2 rounded-b-2xl shadow-sm border-b border-white/20">
        <h2 className="font-bold text-xl tracking-tight">{farm.name}</h2>
        <p className="text-white/80 text-sm font-medium mt-1">{batch.name} • Day <span className="font-bold">{formData.age}</span></p>
      </div>

      <div className="flex bg-black/10 rounded-xl p-1 shadow-inner border border-white/10 mb-5 sticky top-0 z-10 backdrop-blur-sm">
        <button type="button" onClick={() => setActiveTab('performance')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'performance' ? 'bg-white text-[#1d73a5] shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>Performance</button>
        <button type="button" onClick={() => setActiveTab('health')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'health' ? 'bg-white text-[#1d73a5] shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>Health</button>
        <button type="button" onClick={() => setActiveTab('necropsy')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'necropsy' ? 'bg-white text-[#1d73a5] shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>Necropsy</button>
      </div>

      <div className="min-h-[300px]">
        {activeTab === 'performance' && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20">
              <div className="flex gap-4 mb-5">
                <div className="flex-1">
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Date</label>
                  <input type="date" className="w-full border-b-2 border-white/30 focus:border-white py-1.5 bg-transparent text-sm font-bold text-white outline-none transition-colors" style={{colorScheme:'dark'}} value={formData.date} onChange={handleDateChange} />
                </div>
                <div className="w-24">
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Age (Days)</label>
                  <input type="number" className="w-full border-b-2 border-white/30 focus:border-white py-1.5 bg-transparent text-xl font-black text-white text-center outline-none transition-colors" value={formData.age} readOnly />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Avg Daily Mortality</label>
                  <input required type="number" placeholder="Count" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white font-bold focus:bg-black/20 focus:border-white outline-none transition-all text-center text-lg" value={formData.mortality} onChange={e => setFormData({...formData, mortality: e.target.value})} />
                  {formData.mortality && (
                     <div className="mt-2 text-[10px] text-center text-white/70 bg-black/10 rounded py-1 border border-white/5">
                        {formData.daysSinceLastVisit} days × {formData.mortality} = <strong className="text-white">{computedPeriodMortality} total</strong>
                     </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Avg Body Wt (g)</label>
                  <input required type="number" placeholder="Grams" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white font-bold focus:bg-black/20 focus:border-white outline-none transition-all text-center text-lg" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} />
                </div>
              </div>

              <div className="mt-5 p-3.5 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center text-sm shadow-inner">
                <span className="text-white/80 font-bold uppercase tracking-wider text-[11px]">Est. Live Birds</span>
                <span className="font-bold text-white text-lg">{currentAlive}</span>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2"><span className="bg-white/20 text-white p-1.5 rounded-lg border border-white/30"><Droplets size={14}/></span> Feed Data</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Feed Type</label>
                  <select className="w-full border border-white/30 p-3.5 rounded-lg bg-[#2a8cbd] text-white text-sm outline-none focus:border-white shadow-sm" value={formData.feedType} onChange={e => setFormData({...formData, feedType: e.target.value})}>
                    <option className="text-slate-800 bg-white">Pre-Starter</option>
                    <option className="text-slate-800 bg-white">Starter</option>
                    <option className="text-slate-800 bg-white">Grower</option>
                    <option className="text-slate-800 bg-white">Finisher</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Period Feed (kg)</label>
                  <input required type="number" placeholder="Kg" step="0.1" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white font-bold outline-none focus:border-white focus:bg-black/20 transition-all shadow-inner" value={formData.feedQty} onChange={e => setFormData({...formData, feedQty: e.target.value})} />
                  {formData.feedQty && (
                     <div className="mt-2 text-[10px] text-center text-white/70 bg-black/10 rounded py-1 border border-white/5">
                        Cum. Feed: <strong className="text-white">{cumulativeFeedNow.toFixed(1)} kg</strong>
                     </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white/15 p-5 rounded-xl border border-white/30 grid grid-cols-2 gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
               <div>
                 <p className="text-[10px] uppercase font-bold tracking-widest text-white/70 mb-1">Cum. Mort. %</p>
                 <p className="text-2xl font-black text-white">{mortalityPercent}<span className="text-base font-bold opacity-80">%</span></p>
               </div>
               <div>
                 <p className="text-[10px] uppercase font-bold tracking-widest text-white/70 mb-1">Est. FCR</p>
                 <p className="text-2xl font-black text-white">{fcr}</p>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'health' && (
          <div className="space-y-4 animate-fade-in">
             <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20 space-y-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Observed Symptoms</label>
                  <textarea rows="2" placeholder="e.g., Sneezing, lethargy, bloody droppings..." className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white placeholder-white/50 focus:border-white focus:bg-black/20 outline-none text-sm transition-all" value={formData.symptoms} onChange={e => setFormData({...formData, symptoms: e.target.value})}></textarea>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Diagnosis / Suspicion</label>
                  <input type="text" placeholder="e.g., CRD, Coccidiosis" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white placeholder-white/50 focus:border-white focus:bg-black/20 outline-none text-sm font-bold transition-all" value={formData.diagnosis} onChange={e => setFormData({...formData, diagnosis: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Prescribed Treatment</label>
                  <input type="text" placeholder="Medicines/Actions advised" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white placeholder-white/50 focus:border-white focus:bg-black/20 outline-none text-sm transition-all" value={formData.treatment} onChange={e => setFormData({...formData, treatment: e.target.value})} />
                </div>
             </div>

             <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20">
               <h3 className="font-bold text-white mb-4 flex items-center gap-2"><Thermometer size={16} className="text-white/80"/> Environment</h3>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <input type="number" placeholder="Temp (°C)" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white placeholder-white/50 focus:border-white focus:bg-black/20 outline-none text-sm font-bold text-center transition-all" value={formData.temperature} onChange={e => setFormData({...formData, temperature: e.target.value})} />
                 </div>
                 <div>
                    <input type="number" placeholder="Humidity (%)" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white placeholder-white/50 focus:border-white focus:bg-black/20 outline-none text-sm font-bold text-center transition-all" value={formData.humidity} onChange={e => setFormData({...formData, humidity: e.target.value})} />
                 </div>
               </div>
             </div>

             <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20">
                <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">General Remarks / Notes</label>
                <textarea rows="2" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white focus:border-white focus:bg-black/20 outline-none text-sm transition-all" value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})}></textarea>
             </div>

             {farm.type === 'Layer' && (
               <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20 space-y-4">
                  <h3 className="font-bold text-white flex items-center gap-2 border-b border-white/20 pb-3"><Activity size={16} className="text-[#FFDF00]"/> Layer Diagnostics</h3>
                  
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Egg Shell Quality</label>
                    <select className="w-full border border-white/30 p-3.5 rounded-lg bg-[#2a8cbd] text-white text-sm outline-none focus:border-white shadow-sm" value={formData.layerData.eggQuality} onChange={e => handleLayerChange('eggQuality', e.target.value)}>
                      <option className="text-slate-800 bg-white">Normal</option>
                      <option className="text-slate-800 bg-white">Thin Shelled</option>
                      <option className="text-slate-800 bg-white">Hypopigmentation</option>
                      <option className="text-slate-800 bg-white">Hyperpigmentation</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-2">Common Layer Issues</label>
                    <div className="grid grid-cols-2 gap-3">
                       <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none transition-all ${formData.layerData.layerIssues.prolapse ? 'bg-red-500/20 border-red-500/50 text-white' : 'bg-black/10 border-white/10 text-white/70 hover:bg-black/20'}`}>
                         <input type="checkbox" checked={formData.layerData.layerIssues.prolapse} onChange={() => handleLayerIssueChange('prolapse')} className="rounded text-red-500 focus:ring-red-500 bg-white/50 border-transparent" />
                         <span className="text-xs font-bold">Vent Prolapse</span>
                       </label>
                       <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none transition-all ${formData.layerData.layerIssues.cannibalism ? 'bg-red-500/20 border-red-500/50 text-white' : 'bg-black/10 border-white/10 text-white/70 hover:bg-black/20'}`}>
                         <input type="checkbox" checked={formData.layerData.layerIssues.cannibalism} onChange={() => handleLayerIssueChange('cannibalism')} className="rounded text-red-500 focus:ring-red-500 bg-white/50 border-transparent" />
                         <span className="text-xs font-bold">Cannibalism</span>
                       </label>
                    </div>
                  </div>
               </div>
             )}
          </div>
        )}

        {activeTab === 'necropsy' && (
          <div className="space-y-4 animate-fade-in">
             <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20">
               <div className="flex items-center gap-3 mb-5 border-b border-white/20 pb-4">
                 <div className="bg-white/20 p-2.5 rounded-lg border border-white/30 text-white"><Syringe size={20}/></div>
                 <div>
                   <h3 className="font-bold text-white text-lg">Post-Mortem Record</h3>
                   <p className="text-[11px] font-medium text-white/70 mt-0.5">Upload photos to Secure Cloud Storage</p>
                 </div>
               </div>

               <div className="mb-5">
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Birds Examined</label>
                  <input type="number" placeholder="Quantity" className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white placeholder-white/50 font-bold focus:border-white focus:bg-black/20 outline-none transition-all" value={formData.necropsy.examined} onChange={e => setFormData({...formData, necropsy: {...formData.necropsy, examined: e.target.value}})} />
               </div>

               <div className="mb-5">
                 <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-2">Lesion Checklist</label>
                 <div className="grid grid-cols-2 gap-2">
                   {['Liver', 'Intestine', 'Heart', 'Lungs', 'Bursa'].map(organ => (
                     <label key={organ} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all shadow-sm ${formData.necropsy.lesions[organ] ? 'bg-white/30 border-white text-white font-bold' : 'bg-black/10 border-white/10 text-white/80 font-medium hover:bg-black/20'}`}>
                       <input type="checkbox" checked={formData.necropsy.lesions[organ]} onChange={() => handleLesionChange(organ)} className="rounded text-[#1d73a5] focus:ring-white bg-white/50 border-transparent" />
                       <span className="text-sm tracking-wide">{organ}</span>
                     </label>
                   ))}
                 </div>
               </div>

               <div className="mt-4">
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-white/80 mb-1.5">Lesion Description</label>
                  <textarea rows="2" placeholder="Describe specific findings..." className="w-full border border-white/30 p-3.5 rounded-lg bg-black/10 text-white placeholder-white/50 focus:border-white focus:bg-black/20 outline-none text-sm transition-all" value={formData.necropsy.description} onChange={e => setFormData({...formData, necropsy: {...formData.necropsy, description: e.target.value}})}></textarea>
               </div>
             </div>

             <div className="bg-white/10 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/20">
               <h3 className="font-bold text-white mb-4 flex items-center gap-2">Image Attachments</h3>
               <div className="grid grid-cols-3 gap-3 mb-3">
                 {formData.necropsy.images.map((img, idx) => (
                   <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-white/30 group shadow-sm">
                     <img src={img} alt="Necropsy" className="w-full h-full object-cover" />
                     <button type="button" onClick={() => removeImage(idx)} className="absolute top-1.5 right-1.5 bg-black/50 backdrop-blur-sm p-1.5 rounded-lg text-white shadow hover:bg-red-500 transition-colors border border-white/20"><Trash2 size={14}/></button>
                   </div>
                 ))}
                 
                 <button type="button" onClick={() => fileInputRef.current?.click()} className="aspect-square flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/40 rounded-xl text-white/70 hover:bg-white/10 hover:border-white hover:text-white transition-colors bg-black/5">
                   <Camera size={24} />
                   <span className="text-[10px] font-bold uppercase tracking-widest">Add Photo</span>
                 </button>
               </div>
               <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
               <p className="text-[10px] text-white/60 text-center font-medium mt-4">Images are compressed for offline storage.</p>
             </div>
          </div>
        )}
      </div>

      <div className="pt-4 mt-5 border-t border-white/20 sticky bottom-[70px] bg-[#2a8ebd]/90 backdrop-blur-md pb-2 -mx-4 px-4">
        <button type="submit" disabled={loading} className="w-full bg-white text-[#1d73a5] p-4 rounded-xl font-bold shadow-[0_5px_15px_rgba(0,0,0,0.15)] active:scale-95 hover:bg-sky-50 transition-all flex justify-center items-center gap-2 text-base uppercase tracking-wide">
          {loading ? 'Uploading & Saving...' : <><CheckCircle size={20}/> Save Visit Record</>}
        </button>
      </div>
    </form>
  );
};

const SettingsView = ({ user }) => {
  return (
    <div className="space-y-4">
      <div className="bg-white/10 backdrop-blur-md p-6 rounded-xl shadow-lg border border-white/20 text-center">
        <h3 className="font-bold text-white mb-6 text-sm uppercase tracking-widest">System Info</h3>
        <div className="flex justify-center mb-6">
           <img src={CUSTOM_LOGO_URL} alt="Custom Logo" className="w-24 h-24 rounded-2xl object-cover shadow-lg border-2 border-white/50 bg-white" />
        </div>
        <p className="text-sm font-bold text-[#FFDF00] uppercase tracking-wider mb-1">SWIFT®️ Poultry Tracker</p>
        <p className="text-[10px] text-white/70 font-medium uppercase tracking-widest">Version 2.0 (Enterprise)</p>
      </div>
    </div>
  );
};
