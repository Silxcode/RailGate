/**
 * Indian Railway Zones Configuration
 * 16 zones with their key stations for NTES scraping
 */

const RAILWAY_ZONES = [
    {
        id: 'CR',
        name: 'Central Railway',
        headquarters: 'Mumbai',
        divisions: ['Mumbai', 'Nagpur', 'Bhusawal', 'Pune', 'Sholapur'],
        stations: ['CSTM', 'CSMT', 'DR', 'NGP', 'BSL', 'PUNE', 'SUR']
    },
    {
        id: 'ER',
        name: 'Eastern Railway',
        headquarters: 'Kolkata',
        divisions: ['Howrah-I', 'Howrah-II', 'Sealdah', 'Malda', 'Asansol', 'Chitaranjan', 'Kolkata Metro'],
        stations: ['HWH', 'SDAH', 'KOAA', 'MLDT', 'ASN', 'CRJ']
    },
    {
        id: 'ECR',
        name: 'East Central Railway',
        headquarters: 'Hajipur',
        divisions: ['Danapur', 'Mugalsarai', 'Dhanbad', 'Sonpur', 'Samastipur'],
        stations: ['DNR', 'MGS', 'DHN', 'SEE', 'SPJ', 'HJP']
    },
    {
        id: 'ECoR',
        name: 'East Coast Railway',
        headquarters: 'Bhubaneshwar',
        divisions: ['Khurda Road', 'Waltair', 'Sambhalpur'],
        stations: ['KUR', 'BBS', 'VSKP', 'SBP']
    },
    {
        id: 'NR',
        name: 'Northern Railway',
        headquarters: 'New Delhi',
        divisions: ['Delhi-I', 'Delhi-II', 'Ambala', 'Moradabad', 'Lucknow', 'Firozpur'],
        stations: ['NDLS', 'DLI', 'NZM', 'UMB', 'MB', 'LKO', 'FZR']
    },
    {
        id: 'NCR',
        name: 'North Central Railway',
        headquarters: 'Allahabad',
        divisions: ['Allahabad', 'Jhansi', 'Agra'],
        stations: ['ALD', 'PRYJ', 'JHS', 'AGC']
    },
    {
        id: 'NER',
        name: 'North Eastern Railway',
        headquarters: 'Gorakhpur',
        divisions: ['Izzatnagar', 'Lucknow', 'Varanasi', 'DLW'],
        stations: ['GKP', 'IZN', 'LJN', 'BCY', 'DLW']
    },
    {
        id: 'NFR',
        name: 'North Frontier Railway',
        headquarters: 'Guwahati',
        divisions: ['Katihar', 'Alipurduar', 'Rangiya', 'Lumding', 'Tinsukhia'],
        stations: ['GHY', 'KIR', 'APDJ', 'RNY', 'LMG', 'TSK']
    },
    {
        id: 'NWR',
        name: 'North Western Railway',
        headquarters: 'Jaipur',
        divisions: ['Jaipur', 'Jodhpur', 'Bikaner', 'Ajmer'],
        stations: ['JP', 'JU', 'BKN', 'AII']
    },
    {
        id: 'SR',
        name: 'Southern Railway',
        headquarters: 'Chennai',
        divisions: ['Chennai', 'Madurai', 'Palghat', 'Trichy', 'Trivendrum'],
        stations: ['MAS', 'MS', 'MDU', 'PGT', 'TPJ', 'TVC']
    },
    {
        id: 'SCR',
        name: 'South Central Railway',
        headquarters: 'Secunderabad',
        divisions: ['Secunderabad', 'Hyderabad', 'Guntakal', 'Vijaywada', 'Nanded'],
        stations: ['SC', 'HYB', 'GTL', 'BZA', 'NED']
    },
    {
        id: 'SER',
        name: 'South Eastern Railway',
        headquarters: 'Kolkata',
        divisions: ['Kharagpur', 'Adra', 'Chakradharpur', 'Ranchi', 'Shalimar'],
        stations: ['KGP', 'ADRA', 'CKP', 'RNC', 'SHM']
    },
    {
        id: 'SECR',
        name: 'South East Central Railway',
        headquarters: 'Bilaspur',
        divisions: ['Bilaspur', 'Nagpur', 'Raipur'],
        stations: ['BSP', 'NAG', 'R', 'DURG']
    },
    {
        id: 'SWR',
        name: 'South Western Railway',
        headquarters: 'Hubli',
        divisions: ['Bangalore', 'Mysore', 'Hubli', 'RWF/YNK'],
        stations: ['SBC', 'YPR', 'MYS', 'UBL', 'RWF', 'YNK']
    },
    {
        id: 'WR',
        name: 'Western Railway',
        headquarters: 'Mumbai',
        divisions: ['BCT', 'Vadodara', 'Ahmedabad', 'Ratlam', 'Rajkot', 'Bhavnagar'],
        stations: ['BCT', 'BRC', 'ADI', 'RTM', 'RJT', 'BHU']
    },
    {
        id: 'WCR',
        name: 'West Central Railway',
        headquarters: 'Jabalpur',
        divisions: ['Jabalpur', 'Bhopal', 'Kota'],
        stations: ['JBP', 'BPL', 'KOTA']
    }
];

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RAILWAY_ZONES };
}

window.RAILWAY_ZONES = RAILWAY_ZONES;
