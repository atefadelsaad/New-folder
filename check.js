const fs = require('fs');
const h = fs.readFileSync('C:\\Users\\AtefAdel\\Desktop\\ware_house\\New-folder\\it-warehouse_1.html', 'utf8');
console.log('Dirk:', h.includes('Dirk'));
console.log('debounced calls:', (h.match(/debouncedSearch/g) || []).length);
console.log('search ids:', (h.match(/id="s_/g) || []).length);
console.log('clearSearch calls:', (h.match(/clearSearch\(/g) || []).length);
