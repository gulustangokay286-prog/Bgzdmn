const fs = require('fs');

const gpuToModel = {
  // Apple A-Series GPU mapping (Approximations based on known WebGL vendor strings)
  "Apple A15 GPU": "iPhone 13 / iPhone 14",
  "Apple A16 GPU": "iPhone 14 Pro / iPhone 15",
  "Apple A17 Pro GPU": "iPhone 15 Pro",
  "Apple A14 GPU": "iPhone 12",
  "Apple A13 GPU": "iPhone 11",
  
  // Adreno (Snapdragon) mappings
  "Adreno (TM) 740": "Snapdragon 8 Gen 2 (Samsung S23, Xiaomi 13)",
  "Adreno (TM) 730": "Snapdragon 8 Gen 1 (Samsung S22)",
  "Adreno (TM) 660": "Snapdragon 888 (Samsung S21)",
  "Adreno (TM) 640": "Snapdragon 855",
  
  // Mali (Exynos / MediaTek) mappings
  "Mali-G710": "Dimensity 9000 / Google Tensor G2",
  "Mali-G78": "Exynos 2100 (Samsung S21)",
  "Xclipse 920": "Exynos 2200 (Samsung S22)"
};

console.log(gpuToModel);
