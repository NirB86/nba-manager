// Name pools for generated people. Names are combined at random, so any
// resemblance to a real person is coincidental.

export interface NameRegion {
  countries: readonly (readonly [string, number])[];
  first: readonly string[];
  last: readonly string[];
}

const US: NameRegion = {
  countries: [['USA', 1]],
  first: [
    'Jalen', 'Marcus', 'Tyrese', 'Darius', 'Andre', 'Isaiah', 'Malik', 'Devin', 'Trey', 'Jordan',
    'Cameron', 'Brandon', 'Kendall', 'Xavier', 'Elijah', 'Caleb', 'Quentin', 'Terrance', 'Dante', 'Jamal',
    'Desmond', 'Corey', 'Austin', 'Tyler', 'Grant', 'Mason', 'Logan', 'Bryce', 'Chase', 'Cole',
    'Derrick', 'Reggie', 'Lamar', 'Keon', 'Amari', 'Jaylen', 'Josiah', 'Nate', 'Zeke', 'Rashad',
    'Shawn', 'Trevon', 'Damon', 'Kellen', 'Aaron', 'Cedric', 'Jerome', 'Ty', 'Miles', 'Dwayne',
    'Kyle', 'Ethan', 'Owen', 'Wyatt', 'Garrett', 'Landon', 'Kenny', 'Omari', 'Javon', 'Micah',
    'Adrian', 'Bryson', 'Collin', 'Dorian', 'Emmanuel', 'Gavin', 'Jace', 'Khalil', 'Marquis', 'Nolan',
    'Preston', 'Rodney', 'Sterling', 'Tobias', 'Vernon', 'Wesley', 'Cyrus', 'Elliot', 'Harold', 'Leon',
  ],
  last: [
    'Washington', 'Jefferson', 'Mitchell', 'Harris', 'Robinson', 'Walker', 'Coleman', 'Bryant', 'Hayes', 'Graham',
    'Simmons', 'Brooks', 'Henderson', 'Patterson', 'Jenkins', 'Price', 'Fletcher', 'Reed', 'Barnes', 'Holloway',
    'Whitfield', 'Pruitt', 'Lattimore', 'McCray', 'Dawkins', 'Tolliver', 'Haskins', 'Merriweather', 'Crenshaw', 'Ellison',
    'Prescott', 'Gaines', 'Battle', 'Ingersoll', 'Kearney', 'Lockett', 'Ormsby', 'Sutton', 'Talbert', 'Vaughn',
    'Wilder', 'Carver', 'Dorsey', 'Easley', 'Fountain', 'Garner', 'Hathaway', 'Lyman', 'Monroe', 'Neville',
    'Oakes', 'Pembrook', 'Quarles', 'Rollins', 'Stokes', 'Thornton', 'Underwood', 'Vance', 'Whitaker', 'Yancey',
    'Callahan', 'Donovan', 'Kowalski', 'Sullivan', 'Brennan', 'Hartley', 'Lindqvist', 'McAllister', 'Novak', 'Schaefer',
    'Abernathy', 'Bledsoe', 'Calloway', 'Dunlap', 'Everett', 'Fairley', 'Gentry', 'Hollis', 'Isley', 'Jessup',
    'Kirkland', 'Langston', 'Maddox', 'Norwood', 'Ogletree', 'Pettaway', 'Ransom', 'Satterfield', 'Trammell', 'Upshaw',
    'Varner', 'Wakefield', 'Yarbrough', 'Ashby', 'Benton', 'Cobb', 'Dupree', 'Elmore', 'Fenwick', 'Goodwin',
    'Hightower', 'Irby', 'Jamison', 'Kendrick', 'Lowell', 'Mayfield', 'Newsome', 'Overton', 'Parrish', 'Redding',
    'Shelton', 'Toliver', 'Umstead', 'Vickers', 'Winslow', 'Ayers', 'Blount', 'Cheatham', 'Dockery', 'Ezell',
    'Fortson', 'Gaskins', 'Holcomb', 'Isom', 'Jernigan', 'Kincaid', 'Lassiter', 'Manning', 'Northcutt', 'Oliver',
    'Pinkney', 'Rucker', 'Sims', 'Tillman', 'Upton', 'Vereen', 'Whitley', 'Bowden', 'Crawley', 'Doss',
    'Frazier', 'Gilliam', 'Harrell', 'Keller', 'Lambert', 'McKnight', 'Nolan', 'Pace', 'Quinn', 'Riddick',
  ],
};

const EUROPE: NameRegion = {
  countries: [['France', 3], ['Serbia', 3], ['Spain', 2], ['Germany', 2], ['Lithuania', 2], ['Greece', 2], ['Slovenia', 1], ['Italy', 1], ['Turkey', 1], ['Croatia', 1]],
  first: [
    'Lukas', 'Nikola', 'Matteo', 'Théo', 'Hugo', 'Mateo', 'Jonas', 'Dario', 'Marko', 'Stefan',
    'Yiannis', 'Kostas', 'Tomas', 'Arnas', 'Bogdan', 'Ivan', 'Pau', 'Sergio', 'Moritz', 'Felix',
    'Lorenzo', 'Emre', 'Cem', 'Victor', 'Bilal', 'Rémi', 'Evan', 'Dennis', 'Franz', 'Nemanja',
  ],
  last: [
    'Petrović', 'Jovanović', 'Marković', 'Kalnius', 'Sakalas', 'Vaitkus', 'Papadakis', 'Antonopoulos', 'Fernández', 'Navarro',
    'Ruiz', 'Lemaire', 'Dubois', 'Moreau', 'Fontaine', 'Schreiber', 'Weidner', 'Hartmann', 'Bianchi', 'Romano',
    'Dolenc', 'Kovač', 'Horvat', 'Yılmaz', 'Şahin', 'Babić', 'Milić', 'Vasko', 'Bertrand', 'Okoro',
  ],
};

const AFRICA: NameRegion = {
  countries: [['Nigeria', 3], ['Cameroon', 2], ['Senegal', 2], ['South Sudan', 1], ['DR Congo', 1]],
  first: ['Chidi', 'Emeka', 'Paul', 'Joel', 'Serge', 'Moussa', 'Garang', 'Tunde', 'Ousmane', 'Abdou', 'Christian', 'Malick', 'Josh', 'Obinna', 'Didier'],
  last: ['Okonkwo', 'Achebe', 'Mbarga', 'Ndiaye', 'Diallo', 'Mayen', 'Deng', 'Nwosu', 'Eze', 'Kamara', 'Sy', 'Mbuyi', 'Badji', 'Adeyemi', 'Fall'],
};

const OCEANIA_AMERICAS: NameRegion = {
  countries: [['Canada', 4], ['Australia', 3], ['Brazil', 1], ['Argentina', 1], ['Dominican Republic', 1], ['New Zealand', 1]],
  first: ['Liam', 'Declan', 'Josh', 'Callum', 'Lachlan', 'Simon', 'Andrew', 'RJ', 'Brodie', 'Thiago', 'Tomás', 'Karl', 'Steven', 'Hamish', 'Rafael'],
  last: ['Mackenzie', 'Thompson', 'Brennock', 'Gallagher', 'Bellamy', 'Ostrowski', 'Bouchard', 'Silva', 'Carrizo', 'Delgado', 'Ashford', 'Webster', 'Milne', 'Lawlor', 'Duarte'],
};

export const PLAYER_REGIONS: readonly (readonly [NameRegion, number])[] = [
  [US, 72],
  [EUROPE, 15],
  [AFRICA, 6],
  [OCEANIA_AMERICAS, 7],
];

/** Staff skew heavily American, with some international coaches. */
export const STAFF_REGIONS: readonly (readonly [NameRegion, number])[] = [
  [US, 85],
  [EUROPE, 12],
  [OCEANIA_AMERICAS, 3],
];
