from __future__ import annotations

from pathlib import Path
import csv
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import FormulaRule
from openpyxl.comments import Comment

OUT = Path('/mnt/data')
XLSX = OUT / 'capsicum_genetics_evidence_catalog_v0_1.xlsx'
LOCUS_CSV = OUT / 'capsicum_locus_catalog_v0_1.csv'
SOURCES_CSV = OUT / 'capsicum_sources_v0_1.csv'
README_MD = OUT / 'CAPSICUM_GENETICS_DATASET_README_v0_1.md'

sources = [
    {
        'source_id':'SRC001','year':2015,'title':'Evidence of capsaicin synthase activity of the Pun1-encoded protein and its role as a determinant of capsaicinoid accumulation in pepper','authors':'Ogawa et al.','journal':'BMC Plant Biology','doi':'10.1186/s12870-015-0476-7','pmid':'25884984','source_type':'Primary functional study','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/25884984/','key_use':'Functional evidence that Pun1 participates directly in capsaicin synthesis; VIGS, protein inhibition, and HPLC evidence.','limitations':'Does not make exact SHU predictable; cultivar and developmental context remain important.'
    },
    {
        'source_id':'SRC002','year':2009,'title':'Contrasting modes for loss of pungency between cultivated and wild species of Capsicum','authors':'Stellari et al.','journal':'Heredity','doi':'10.1038/hdy.2009.131','pmid':'19812612','source_type':'Primary genetic mapping/complementation','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/19812612/','key_use':'Documents independent Pun1 loss-of-function alleles and shows Pun2 nonpungency in C. chacoense is non-allelic to Pun1.','limitations':'Pun2 was not identified molecularly in this paper.'
    },
    {
        'source_id':'SRC003','year':2019,'title':'Discovery of novel unfunctional pAMT allele pamt10 causing loss of pungency in sweet bell pepper (Capsicum annuum L.)','authors':'Tsurumaki and Sasanuma','journal':'Breeding Science','doi':'10.1270/jsbbs.18150','pmid':'31086491','source_type':'Primary allele/genetic study','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/31086491/','key_use':'Identifies a nonsense pAMT allele causing nonpungency despite intact Pun1.','limitations':'Specific allele and genetic background; does not imply all pAMT variants are null.'
    },
    {
        'source_id':'SRC004','year':2019,'title':'Positional differences of intronic transposons in pAMT affect the pungency level in chili pepper through altered splicing efficiency','authors':'Tanaka et al.','journal':'Plant Journal','doi':'','pmid':'31323150','source_type':'Primary allele/function study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/31323150/','key_use':'Shows leaky pAMT alleles can reduce capsaicinoid accumulation to different degrees through altered splicing.','limitations':'Quantitative effects are population- and allele-specific.'
    },
    {
        'source_id':'SRC005','year':2018,'title':'Mutation in the putative ketoacyl-ACP reductase CaKR1 induces loss of pungency in Capsicum','authors':'Koeda et al.','journal':'Theoretical and Applied Genetics','doi':'','pmid':'30267113','source_type':'Primary mapping and functional validation','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/30267113/','key_use':'Maps a recessive nonpungency locus in C. chinense and functionally supports CaKR1 involvement.','limitations':'Validated in specific material; broader allele catalog remains incomplete.'
    },
    {
        'source_id':'SRC006','year':2017,'title':'An R2R3-MYB Transcription Factor Regulates Capsaicinoid Biosynthesis','authors':'Arce-Rodríguez and Ochoa-Alejo','journal':'Plant Physiology','doi':'10.1104/pp.17.00506','pmid':'28483879','source_type':'Primary functional regulatory study','open_access':'Yes','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC5490919/','key_use':'CaMYB31 silencing reduced biosynthetic gene expression and capsaicinoid content.','limitations':'Regulatory evidence does not define a simple Mendelian phenotype rule or exact heat level.'
    },
    {
        'source_id':'SRC007','year':2020,'title':'Phytoene synthase 2 can compensate for the absence of PSY1 in the control of color in Capsicum fruit','authors':'Jang et al.','journal':'Journal of Experimental Botany','doi':'10.1093/jxb/eraa155','pmid':'32219321','source_type':'Primary functional study','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/32219321/','key_use':'Demonstrates PSY2 compensation in a PSY1-deleted and CCS-mutant background; supports multi-gene color modeling.','limitations':'Specific genotype and cultivar background; not a universal color lookup.'
    },
    {
        'source_id':'SRC008','year':2018,'title':'Single-molecule real-time sequencing reveals diverse allelic variations in carotenoid biosynthetic genes in pepper (Capsicum spp.)','authors':'Jang et al.','journal':'Plant Biotechnology Journal','doi':'','pmid':'30467964','source_type':'Primary multi-accession allele study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/30467964/','key_use':'Catalogs allelic variation in PSY1, PSY2, LCYB, BCH, ZEP, and CCS across 94 accessions with pigment analysis.','limitations':'Alleles do not fully explain all mature fruit colors; association is not always causal.'
    },
    {
        'source_id':'SRC009','year':2021,'title':'A mutation in Zeaxanthin epoxidase contributes to orange coloration and alters carotenoid contents in pepper fruit (Capsicum annuum)','authors':'Lee et al.','journal':'Plant Journal','doi':'10.1111/tpj.15264','pmid':'33825226','source_type':'Primary mapping and functional candidate study','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/33825226/','key_use':'Maps CaOr and identifies a ZEP splicing mutation associated with orange fruit in a defined cross.','limitations':'Population-specific; color depends on PSY1/CCS and broader carotenoid background.'
    },
    {
        'source_id':'SRC010','year':2008,'title':'Chlorophyll breakdown during pepper fruit ripening in the chlorophyll retainer mutation is impaired at the homolog of the senescence-inducible stay-green gene','authors':'Borovsky and Paran','journal':'Theoretical and Applied Genetics','doi':'10.1007/s00122-008-0768-5','pmid':'18427769','source_type':'Primary mapping/candidate allele study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/18427769/','key_use':'CaSGR cosegregates with the cl chlorophyll-retainer mutation and carries a candidate amino-acid substitution.','limitations':'Candidate evidence and a specific mutant allele; ripe appearance also depends on carotenoid background.'
    },
    {
        'source_id':'SRC011','year':2014,'title':'CaGLK2 regulates natural variation of chlorophyll content and fruit color in pepper fruit','authors':'Brand et al.','journal':'Theoretical and Applied Genetics','doi':'10.1007/s00122-014-2367-y','pmid':'25096887','source_type':'Primary QTL/candidate validation study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/25096887/','key_use':'Supports CaGLK2 as underlying pc10 QTL affecting chloroplast compartment size, chlorophyll content, and immature fruit color.','limitations':'Quantitative and genetic-background dependent.'
    },
    {
        'source_id':'SRC012','year':2013,'title':'Network inference analysis identifies an APRR2-like gene linked to pigment accumulation in tomato and pepper fruits','authors':'Pan et al.','journal':'Plant Physiology','doi':'10.1104/pp.112.212654','pmid':'23292788','source_type':'Primary comparative/network and association study','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/23292788/','key_use':'Supports APRR2-like involvement in plastid and pigment accumulation in pepper fruit.','limitations':'Does not by itself establish a universal single-locus inheritance model.'
    },
    {
        'source_id':'SRC013','year':2025,'title':'Genetic Regulation of Chlorophyll Biosynthesis in Pepper Fruit: Roles of CaAPRR2 and CaGLK2','authors':'Study authors as indexed by PubMed','journal':'Peer-reviewed article','doi':'','pmid':'40004548','source_type':'Primary BSA-seq/candidate study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/40004548/','key_use':'Reports joint effects of CaAPRR2 and CaGLK2 in a defined F2 population.','limitations':'Recent, population-specific candidate-gene evidence; needs independent replication before broad production rules.'
    },
    {
        'source_id':'SRC014','year':2023,'title':'Identification of CaPs locus involving in purple stripe formation on unripe fruit, reveals allelic variation and alternative splicing of R2R3-MYB transcription factor in pepper','authors':'Li et al.','journal':'Frontiers in Plant Science','doi':'10.3389/fpls.2023.1140851','pmid':'37056500','source_type':'Primary mapping and functional candidate study','open_access':'Yes','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC10089288/','key_use':'Maps CaPs and supports CA10g11690/CaAN3 as an allele affecting purple stripe formation.','limitations':'Specific allele, tissue pattern, and population; not equivalent to all purple pigmentation.'
    },
    {
        'source_id':'SRC015','year':1999,'title':'Expression of the Bs2 pepper gene confers resistance to bacterial spot disease in tomato','authors':'Tai et al.','journal':'PNAS','doi':'10.1073/pnas.96.24.14153','pmid':'10570214','source_type':'Primary gene cloning and functional validation','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/10570214/','key_use':'Bs2 was cloned and shown to recognize Xanthomonas strains carrying avrBs2.','limitations':'Resistance is pathogen-effector dependent and not universal to all bacterial spot strains.'
    },
    {
        'source_id':'SRC016','year':2007,'title':'Plant pathogen recognition mediated by promoter activation of the pepper Bs3 resistance gene','authors':'Römer et al.','journal':'Science','doi':'10.1126/science.1144958','pmid':'17962564','source_type':'Primary mechanistic study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/17962564/','key_use':'Shows Bs3/Bs3-E recognition specificity resides in promoter activation by matching AvrBs3-family effectors.','limitations':'Requires pathogen effector identity and host allele; race-specific.'
    },
    {
        'source_id':'SRC017','year':2005,'title':'Allele-specific CAPS markers based on point mutations in resistance alleles at the pvr1 locus encoding eIF4E in Capsicum','authors':'Ruffel et al.','journal':'Theoretical and Applied Genetics','doi':'','pmid':'16283234','source_type':'Primary allele-marker study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/16283234/','key_use':'Defines coding polymorphisms for recessive pvr1 resistance alleles and marker-assisted selection.','limitations':'Virus-strain spectrum varies by allele; homozygosity and genetic context matter.'
    },
    {
        'source_id':'SRC018','year':2017,'title':'Divergent evolution of multiple virus-resistance genes from a progenitor in Capsicum spp.','authors':'Kim et al.','journal':'New Phytologist','doi':'10.1111/nph.14177','pmid':'27612097','source_type':'Primary gene cloning study','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/27612097/','key_use':'Clones Pvr4 and Tsw as related NLR genes on chromosome 10 with distinct virus recognition.','limitations':'Resistance remains isolate/pathotype dependent and can be overcome.'
    },
    {
        'source_id':'SRC019','year':2008,'title':'Development of a sequence characteristic amplified region marker linked to the L4 locus conferring broad spectrum resistance to tobamoviruses in pepper plants','authors':'Kim et al.','journal':'Molecules and Cells','doi':'','pmid':'18414011','source_type':'Primary linkage-marker study','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/18414011/','key_use':'Provides linked marker evidence for L4-mediated tobamovirus resistance.','limitations':'Marker is linked rather than necessarily causal; later pathotypes can overcome L4.'
    },
    {
        'source_id':'SRC020','year':2008,'title':'Two Amino Acid Substitutions in the Coat Protein of Pepper mild mottle virus Are Responsible for Overcoming the L4 Gene-Mediated Resistance in Capsicum spp.','authors':'Genda et al.','journal':'Phytopathology','doi':'','pmid':'18943927','source_type':'Primary pathogen escape study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/18943927/','key_use':'Demonstrates a PMMoV pathotype can overcome L4, proving pathotype-specific limits.','limitations':'Specific viral isolates and experimental conditions.'
    },
    {
        'source_id':'SRC021','year':2016,'title':'Fine mapping of Restorer-of-fertility in pepper identified a candidate gene encoding a PPR-containing protein','authors':'Jo et al.','journal':'Theoretical and Applied Genetics','doi':'10.1007/s00122-016-2755-6','pmid':'27470425','source_type':'Primary fine mapping/candidate study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/27470425/','key_use':'Fine maps Rf and identifies CaPPR6 as a strong candidate in a defined CMS/restorer system.','limitations':'Candidate rather than universally proven causal allele; CMS systems differ among lines.'
    },
    {
        'source_id':'SRC022','year':2008,'title':'Linkage analysis between partial restoration and Restorer-of-fertility loci in pepper cytoplasmic male sterility','authors':'Lee et al.','journal':'Theoretical and Applied Genetics','doi':'10.1007/s00122-008-0782-7','pmid':'18465115','source_type':'Primary inheritance/linkage study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/18465115/','key_use':'Shows CMS restoration involves a major Rf locus, modifier effects, partial restoration, and temperature sensitivity.','limitations':'Specific cytoplasm and breeding material; prevents a simplistic single-gene universal rule.'
    },
    {
        'source_id':'SRC023','year':2022,'title':'Fine mapping of Rf2, a minor Restorer-of-fertility gene for cytoplasmic male sterility in chili pepper G164','authors':'Zhang et al.','journal':'Theoretical and Applied Genetics','doi':'10.1007/s00122-022-04143-7','pmid':'35710637','source_type':'Primary fine mapping/candidate study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/35710637/','key_use':'Supports a second dominant restoration locus and identifies Capana06g000193 as a strong candidate.','limitations':'Specific restorer line and CMS background; candidate status.'
    },
    {
        'source_id':'SRC024','year':2025,'title':'Fine mapping of the Chilli veinal mottle virus resistance 4 (cvr4) gene in pepper','authors':'Study authors as indexed by PubMed','journal':'Theoretical and Applied Genetics','doi':'','pmid':'39777543','source_type':'Primary fine mapping and gene-silencing study','open_access':'Unknown','url':'https://pubmed.ncbi.nlm.nih.gov/39777543/','key_use':'Defines cvr4 as a single recessive ChiVMV resistance locus in a specified population and maps it to chromosome 11.','limitations':'Gene identity and resistance breadth require additional validation.'
    },
    {
        'source_id':'SRC025','year':2026,'title':'Spicy genes: mapping quantitative genomic regions and candidate genes for capsaicinoid and capsinoid biosynthesis in pepper','authors':'Vergnano et al.','journal':'Frontiers in Plant Science','doi':'10.3389/fpls.2026.1823752','pmid':'42375797','source_type':'Systematic QTL integration/review','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/42375797/','key_use':'Integrates 155 reported QTLs into 23 quantitative genomic regions on CM334 v1.6.','limitations':'QTL synthesis is not a direct causal-allele catalog and is population/reference-build dependent.'
    },
    {
        'source_id':'SRC026','year':2023,'title':'Pepper Genomics Database and pan-genome/variome resource','authors':'Fei lab / Liu et al. resource','journal':'Database resource linked to Nature Communications 2023 work','doi':'','pmid':'','source_type':'Official genomic resource','open_access':'Yes','url':'https://ted.bti.cornell.edu/cgi-bin/pepper/index','key_use':'Reference genomes, annotations, pan-genome, and variants for 500 core Capsicum accessions.','limitations':'Gene IDs and coordinates must be tied to explicit assembly versions.'
    },
    {
        'source_id':'SRC027','year':2020,'title':'Enabling reusability of plant phenomic datasets with MIAPPE 1.1','authors':'Papoutsoglou et al.','journal':'New Phytologist','doi':'','pmid':'32171029','source_type':'Community data standard publication','open_access':'Yes','url':'https://pubmed.ncbi.nlm.nih.gov/32171029/','key_use':'Defines minimum metadata and a data model for reusable plant phenotyping experiments.','limitations':'A metadata standard, not a Capsicum genetic model.'
    },
    {
        'source_id':'SRC028','year':2015,'title':'FAO/Bioversity Multi-Crop Passport Descriptors V.2.1','authors':'Alercia, Diulgheroff, and Mackay','journal':'FAO/Bioversity standard','doi':'','pmid':'','source_type':'Official germplasm passport standard','open_access':'Yes','url':'https://alliancebioversityciat.org/publications-data/faobioversity-multi-crop-passport-descriptors-v21-mcpd-v21-december-2015','key_use':'International standard for accession passport and provenance data.','limitations':'Does not cover detailed genetic assertions or experiments.'
    },
    {
        'source_id':'SRC029','year':1995,'title':'Descriptors for Capsicum (Capsicum spp.)','authors':'IPGRI/AVRDC/CATIE','journal':'Crop descriptor publication','doi':'','pmid':'','source_type':'Official crop descriptor list','open_access':'Yes','url':'https://alliancebioversityciat.org/publications-data/descriptors-capsicum-capsicum-spp','key_use':'Standardized Capsicum characterization and evaluation terminology.','limitations':'Some terminology predates modern molecular genetics and should be mapped rather than copied blindly.'
    },
    {
        'source_id':'SRC030','year':2019,'title':'BrAPI—an application programming interface for plant breeding applications','authors':'Selby et al.','journal':'Bioinformatics','doi':'','pmid':'','source_type':'Community interoperability standard publication','open_access':'Yes','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC6792114/','key_use':'Standard API concepts for germplasm, studies, observations, and marker data exchange.','limitations':'Implement only needed endpoints; it does not define scientific validity.'
    },
]

loci = [
    {'catalog_id':'LOC001','canonical_symbol':'Pun1','aliases':'C; AT3; capsaicinoid synthase-associated acyltransferase','gene_or_candidate':'Pun1 / BAHD acyltransferase','trait_category':'Pungency','trait_scope':'Capability for normal capsaicinoid synthesis','species_scope':'Capsicum spp.; strongest allele evidence in C. annuum, C. chinense, C. frutescens','chromosome':'2','model_class':'Nuclear Mendelian locus with multiple alleles','inheritance_summary':'Functional allele is commonly dominant for presence capability; documented loss-of-function alleles are recessive in studied crosses.','evidence_grade':'A','evidence_status':'Functionally validated causal pathway gene with multiple null alleles','genotype_prediction':'Exact allele segregation when parental calls are verified','phenotype_prediction':'Conditional only','supported_claim':'A verified null Pun1 allele can explain nonpungency in documented backgrounds; functional Pun1 supports capsaicinoid synthesis.','prohibited_claim':'Functional Pun1 guarantees a particular SHU or even pungency when other pathway loci are defective.','required_context':'Exact allele, species/accession, assay method, developmental stage, and status of pAMT/CaKR1/other pathway genes.','primary_sources':'SRC001; SRC002','release_status':'MVP eligible with safeguards','review_priority':'P0'},
    {'catalog_id':'LOC002','canonical_symbol':'pAMT','aliases':'putative aminotransferase; vanillylamine synthase; CA03g08530','gene_or_candidate':'pAMT','trait_category':'Pungency','trait_scope':'Vanillylamine production and capsaicinoid accumulation','species_scope':'Capsicum spp.; documented alleles in C. annuum and C. chacoense','chromosome':'3','model_class':'Nuclear multi-allelic locus; null and leaky alleles','inheritance_summary':'Documented null alleles can be recessive for nonpungency; leaky alleles produce quantitative reductions.','evidence_grade':'A','evidence_status':'Functionally supported enzyme; multiple characterized alleles','genotype_prediction':'Exact allele segregation when allele is identified','phenotype_prediction':'Conditional/allele-specific','supported_claim':'Specific null pAMT alleles can cause nonpungency despite functional Pun1; leaky alleles can reduce capsaicinoids.','prohibited_claim':'Any pAMT variant predicts a universal percentage reduction or exact SHU.','required_context':'Exact allele sequence, splice behavior, genetic background, Pun1 status, assay protocol.','primary_sources':'SRC003; SRC004','release_status':'MVP eligible for named validated alleles','review_priority':'P0'},
    {'catalog_id':'LOC003','canonical_symbol':'CaKR1','aliases':'putative ketoacyl-ACP reductase','gene_or_candidate':'CaKR1','trait_category':'Pungency','trait_scope':'Branched-chain fatty-acid pathway contribution to capsaicinoid synthesis','species_scope':'Validated in a C. chinense mapping population and functional assays','chromosome':'10','model_class':'Nuclear recessive loss-of-function model in studied cross','inheritance_summary':'A transposon-disrupted allele segregated as a recessive nonpungency factor in the reported material.','evidence_grade':'A','evidence_status':'Strong genetic, biochemical, and silencing support','genotype_prediction':'Exact for the documented allele','phenotype_prediction':'Population-limited conditional model','supported_claim':'The documented disrupted CaKR1 allele can cause loss of pungency in the studied C. chinense material.','prohibited_claim':'All CaKR1 variants or all chromosome-10 haplotypes determine pungency.','required_context':'Allele identity, species, population, Pun1 and pAMT status.','primary_sources':'SRC005','release_status':'Advisory until broader replication','review_priority':'P1'},
    {'catalog_id':'LOC004','canonical_symbol':'CaMYB31','aliases':'R2R3-MYB transcription factor','gene_or_candidate':'CaMYB31','trait_category':'Pungency regulation','trait_scope':'Regulation of capsaicinoid biosynthetic genes','species_scope':'Functionally studied in C. annuum cultivars','chromosome':'Not normalized in this release','model_class':'Regulatory/quantitative; not a simple Mendelian phenotype rule','inheritance_summary':'No production-ready universal dominance model established.','evidence_grade':'A','evidence_status':'Functional regulatory evidence by silencing and expression analysis','genotype_prediction':'Allele segregation can be calculated if alleles are supplied','phenotype_prediction':'Not eligible for deterministic phenotype prediction','supported_claim':'CaMYB31 activity influences pathway-gene expression and capsaicinoid accumulation.','prohibited_claim':'CaMYB31 genotype alone predicts pungency presence or SHU.','required_context':'Functional variant evidence, expression context, environment, pathway genotype.','primary_sources':'SRC006','release_status':'Observational/research only','review_priority':'P2'},
    {'catalog_id':'LOC005','canonical_symbol':'PSY1','aliases':'phytoene synthase 1; classical Y-associated carotenoid locus in some literature','gene_or_candidate':'PSY1','trait_category':'Mature fruit color','trait_scope':'Carotenoid pathway flux and mature fruit pigmentation','species_scope':'Capsicum spp.; many alleles/accessions','chromosome':'Not normalized in this release','model_class':'Multi-gene pathway component','inheritance_summary':'Loss-of-function effects depend on PSY2, CCS, and broader carotenoid background.','evidence_grade':'A','evidence_status':'Major functional fruit-color gene with multiple alleles','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Blocked unless a validated multi-locus rule matches the exact background','supported_claim':'PSY1 loss can alter carotenoid accumulation and fruit color; PSY2 may partially compensate.','prohibited_claim':'PSY1 alone maps universally to red versus yellow.','required_context':'PSY1 allele, PSY2, CCS, ZEP, pigment measurements, maturity stage.','primary_sources':'SRC007; SRC008','release_status':'Inheritance only; phenotype blocked by default','review_priority':'P0'},
    {'catalog_id':'LOC006','canonical_symbol':'PSY2','aliases':'phytoene synthase 2','gene_or_candidate':'PSY2','trait_category':'Mature fruit color','trait_scope':'Compensatory carotenoid synthesis','species_scope':'Functional evidence in C. annuum MicroPep material','chromosome':'Not normalized in this release','model_class':'Modifier/compensatory pathway component','inheritance_summary':'No universal simple dominance rule.','evidence_grade':'A','evidence_status':'Functional compensation demonstrated by VIGS and biochemical evidence','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Research/advisory only','supported_claim':'Functional PSY2 can support basal carotenoid production when PSY1 is absent in the studied background.','prohibited_claim':'PSY2 universally causes yellow fruit.','required_context':'PSY1 and CCS alleles, expression, accession, pigment profile.','primary_sources':'SRC007; SRC008','release_status':'Research only','review_priority':'P1'},
    {'catalog_id':'LOC007','canonical_symbol':'CCS','aliases':'capsanthin-capsorubin synthase; classical Y-associated locus in some mapping systems','gene_or_candidate':'CCS','trait_category':'Mature fruit color','trait_scope':'Synthesis of red xanthophyll pigments capsanthin/capsorubin','species_scope':'Capsicum spp.','chromosome':'Not normalized in this release','model_class':'Multi-allelic pathway gene with epistasis','inheritance_summary':'Functional and null alleles interact with PSY1/PSY2 and other carotenoid genes.','evidence_grade':'A','evidence_status':'Major carotenoid pathway gene with extensive allele evidence','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Conditional multi-locus only','supported_claim':'CCS variation is a major determinant of carotenoid composition and mature color in many backgrounds.','prohibited_claim':'Functional CCS alone guarantees red fruit, or null CCS alone guarantees yellow/orange.','required_context':'CCS allele plus PSY1/PSY2/ZEP and pigment measurements.','primary_sources':'SRC007; SRC008; SRC009','release_status':'Inheritance only; curated combination models later','review_priority':'P0'},
    {'catalog_id':'LOC008','canonical_symbol':'CaOr / ZEP','aliases':'orange locus; zeaxanthin epoxidase','gene_or_candidate':'ZEP','trait_category':'Mature fruit color','trait_scope':'Orange versus yellow differentiation in a defined cross','species_scope':'C. annuum SNU-mini Orange × SNU-mini Yellow population','chromosome':'2','model_class':'Population-specific recessive allele model with pathway dependencies','inheritance_summary':'Yellow was dominant over orange in the reported cross; orange associated with ZEP splicing mutation.','evidence_grade':'B','evidence_status':'Fine-mapped and strong functional candidate with pigment evidence','genotype_prediction':'Exact for the named allele','phenotype_prediction':'Only within validated compatible background','supported_claim':'The documented ZEP splicing mutation contributes to orange coloration in the studied material.','prohibited_claim':'ZEP genotype universally distinguishes orange from yellow peppers.','required_context':'PSY1 and CCS status, exact ZEP allele, accession/background.','primary_sources':'SRC009','release_status':'Advisory population model','review_priority':'P1'},
    {'catalog_id':'LOC009','canonical_symbol':'cl / CaSGR','aliases':'chlorophyll retainer; STAY-GREEN','gene_or_candidate':'CaSGR','trait_category':'Ripening color','trait_scope':'Chlorophyll degradation during fruit ripening','species_scope':'C. annuum chlorophyll-retainer mutant material','chromosome':'Not normalized in this release','model_class':'Nuclear mutant model; carotenoid-dependent visual outcome','inheritance_summary':'The cl mutation behaves as a chlorophyll-retainer factor in studied material.','evidence_grade':'B','evidence_status':'Cosegregating candidate allele with conserved-residue substitution','genotype_prediction':'Exact for documented allele','phenotype_prediction':'Conditional on carotenoid background','supported_claim':'The documented CaSGR/cl allele impairs chlorophyll breakdown; ripe fruit can appear brown or green depending on carotenoids.','prohibited_claim':'cl alone determines one universal ripe color.','required_context':'CaSGR allele, carotenoid genotype and measured pigments, maturity.','primary_sources':'SRC010','release_status':'Advisory','review_priority':'P1'},
    {'catalog_id':'LOC010','canonical_symbol':'CaGLK2 / pc10','aliases':'GOLDEN2-like 2; pc10 QTL','gene_or_candidate':'CaGLK2','trait_category':'Immature fruit color','trait_scope':'Chloroplast development, chlorophyll content, green intensity','species_scope':'C. annuum; studied mapping populations and accessions','chromosome':'10','model_class':'Quantitative QTL/candidate gene with background effects','inheritance_summary':'Allelic effects are quantitative and interact with background and PRR2/APRR2.','evidence_grade':'B','evidence_status':'Strong QTL, sequence, expression, and functional evidence','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Quantitative advisory only','supported_claim':'CaGLK2 variation contributes to chlorophyll content and immature fruit color intensity.','prohibited_claim':'A single CaGLK2 allele universally yields green versus yellow fruit.','required_context':'PRR2/APRR2 state, background, stage, chlorophyll measurement.','primary_sources':'SRC011; SRC013','release_status':'Research/advisory','review_priority':'P1'},
    {'catalog_id':'LOC011','canonical_symbol':'CaAPRR2 / PRR2','aliases':'APRR2-like; c1-associated regulator in some studies','gene_or_candidate':'CaAPRR2 / PRR2','trait_category':'Fruit pigmentation','trait_scope':'Plastid development and chlorophyll/carotenoid accumulation','species_scope':'C. annuum and comparative Solanaceae evidence','chromosome':'1 in one recent mapped region; assembly-specific verification required','model_class':'Modifier interacting with CaGLK2 and other color genes','inheritance_summary':'No universal simple dominance rule; joint effects reported.','evidence_grade':'B','evidence_status':'Association/network evidence plus recent population-specific mapping','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Research/advisory only','supported_claim':'PRR2/APRR2 variation contributes to fruit pigmentation, often jointly with CaGLK2.','prohibited_claim':'PRR2 is a universal red/yellow or green/yellow switch.','required_context':'Exact allele, GLK2, PSY1/CCS, stage, population.','primary_sources':'SRC012; SRC013','release_status':'Research only pending replication','review_priority':'P1'},
    {'catalog_id':'LOC012','canonical_symbol':'CaAN3 / CaPs','aliases':'CA10g11690; Dem.v1.00043895; purple stripe locus','gene_or_candidate':'CaAN3 R2R3-MYB allele','trait_category':'Anthocyanin','trait_scope':'Purple stripe formation in immature fruit exocarp; associated floral pigmentation','species_scope':'C. annuum Chen12-4-derived mapping populations','chromosome':'10','model_class':'Population-specific allele with tissue-pattern effects','inheritance_summary':'Mapped as a major locus in the reported F2 populations.','evidence_grade':'B','evidence_status':'Fine mapping, co-segregating marker, overexpression and silencing support','genotype_prediction':'Exact for documented allele','phenotype_prediction':'Only for validated stripe model/background','supported_claim':'The documented CaAN3/CaPs allele contributes to purple stripe formation in the studied material.','prohibited_claim':'CaAN3 alone explains all purple, black, foliage, flower, or fruit pigmentation.','required_context':'Exact structural variant/transcript, tissue, developmental stage, CaAN2 and other anthocyanin regulators.','primary_sources':'SRC014','release_status':'Advisory population model','review_priority':'P1'},
    {'catalog_id':'LOC013','canonical_symbol':'Bs2','aliases':'bacterial spot resistance gene 2','gene_or_candidate':'Bs2 NLR','trait_category':'Disease resistance','trait_scope':'Recognition of Xanthomonas strains carrying avrBs2','species_scope':'Pepper gene; functional transfer also shown in tomato','chromosome':'Not normalized in this release','model_class':'Dominant immune receptor–effector interaction','inheritance_summary':'Resistance phenotype requires functional host Bs2 and matching pathogen avrBs2.','evidence_grade':'A','evidence_status':'Cloned and functionally validated resistance gene','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Conditional on pathogen effector/pathotype','supported_claim':'Functional Bs2 can confer resistance to strains carrying recognized avrBs2.','prohibited_claim':'Bs2 confers universal bacterial spot resistance.','required_context':'Host allele, Xanthomonas species/strain, avrBs2 status, temperature/assay conditions.','primary_sources':'SRC015','release_status':'MVP eligible with pathogen-context requirement','review_priority':'P0'},
    {'catalog_id':'LOC014','canonical_symbol':'Bs3 / Bs3-E','aliases':'bacterial spot resistance gene 3 alleles','gene_or_candidate':'Flavin monooxygenase genes with effector-responsive promoters','trait_category':'Disease resistance','trait_scope':'Recognition of AvrBs3-family effectors','species_scope':'C. annuum and Xanthomonas interaction systems','chromosome':'Not normalized in this release','model_class':'Allele-specific promoter–effector interaction','inheritance_summary':'Host resistance depends on exact promoter allele and matching bacterial effector.','evidence_grade':'A','evidence_status':'Mechanistically validated gene–effector recognition','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Conditional on effector identity','supported_claim':'Bs3 and Bs3-E recognize distinct AvrBs3-family effectors through promoter activation specificity.','prohibited_claim':'AvrBs3 is a pepper resistance gene or Bs3 gives generic disease resistance.','required_context':'Host promoter allele, bacterial effector allele, strain/pathovar.','primary_sources':'SRC016','release_status':'MVP eligible with strict interaction model','review_priority':'P0'},
    {'catalog_id':'LOC015','canonical_symbol':'pvr1','aliases':'eIF4E resistance alleles pvr1, pvr1-1, pvr1-2','gene_or_candidate':'eIF4E','trait_category':'Virus resistance','trait_scope':'Recessive loss-of-susceptibility resistance to defined potyviruses/strains','species_scope':'C. annuum and C. chinense germplasm','chromosome':'3','model_class':'Recessive multi-allelic susceptibility-factor model','inheritance_summary':'Resistance generally requires homozygosity for a compatible resistance allele; spectrum differs by allele and virus.','evidence_grade':'A','evidence_status':'Causal coding alleles and functional interaction evidence','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Conditional on virus species/strain','supported_claim':'Named pvr1 coding alleles can confer recessive resistance to defined potyviruses by altering eIF4E–VPg compatibility.','prohibited_claim':'Any pvr1 allele confers resistance to every potyvirus.','required_context':'Exact host allele, zygosity, virus species and strain, alternate eIF4E isoforms.','primary_sources':'SRC017','release_status':'MVP eligible with virus-spectrum tables','review_priority':'P0'},
    {'catalog_id':'LOC016','canonical_symbol':'Pvr4','aliases':'potyvirus resistance 4','gene_or_candidate':'Pvr4 NLR','trait_category':'Virus resistance','trait_scope':'Resistance to defined PVY/PepMoV pathotypes/isolates','species_scope':'C. annuum','chromosome':'10','model_class':'Dominant NLR resistance gene; isolate-specific','inheritance_summary':'Dominant resistance in validated host–virus combinations.','evidence_grade':'A','evidence_status':'Cloned gene with genetic and functional evidence','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Conditional on virus isolate/pathotype','supported_claim':'Functional Pvr4 can recognize defined potyvirus effectors and confer resistance in validated combinations.','prohibited_claim':'Pvr4 is universal or permanently durable against all potyvirus evolution.','required_context':'Host allele, virus isolate/pathotype, environmental assay conditions.','primary_sources':'SRC018','release_status':'MVP eligible with isolate context','review_priority':'P0'},
    {'catalog_id':'LOC017','canonical_symbol':'Tsw','aliases':'Tomato spotted wilt virus resistance gene','gene_or_candidate':'Tsw NLR','trait_category':'Virus resistance','trait_scope':'Resistance to defined TSWV isolates','species_scope':'Originally characterized/cloned from C. chinense','chromosome':'10','model_class':'Dominant NLR resistance gene; isolate-specific','inheritance_summary':'Dominant in validated genetic backgrounds, subject to resistance-breaking isolates.','evidence_grade':'A','evidence_status':'Cloned gene with genetic evidence','genotype_prediction':'Exact allele segregation','phenotype_prediction':'Conditional on TSWV isolate','supported_claim':'Functional Tsw can confer resistance to recognized TSWV isolates.','prohibited_claim':'Tsw guarantees resistance to all TSWV isolates.','required_context':'Exact host allele, virus isolate, temperature and assay conditions.','primary_sources':'SRC018','release_status':'MVP eligible with isolate context','review_priority':'P0'},
    {'catalog_id':'LOC018','canonical_symbol':'L locus series','aliases':'L1; L1a; L2; L3; L4','gene_or_candidate':'Tobamovirus resistance alleles/locus series','trait_category':'Virus resistance','trait_scope':'Pathotype-specific resistance to tobamoviruses','species_scope':'Multiple Capsicum species and introgressions','chromosome':'Not normalized in this release','model_class':'Allelic resistance series with pathotype hierarchy','inheritance_summary':'Dominant resistance responses are allele/pathotype/temperature dependent.','evidence_grade':'B','evidence_status':'Strong classical genetics and linked-marker/pathogen evidence; causal normalization incomplete here','genotype_prediction':'Exact allele segregation if allele identity is known','phenotype_prediction':'Conditional pathotype table only','supported_claim':'L alleles provide differential resistance spectra to tobamovirus pathotypes; L4 can be overcome by evolved PMMoV.','prohibited_claim':'L4 is universally broad-spectrum or resistance cannot break.','required_context':'Exact L allele, virus species/pathotype, coat protein genotype, temperature.','primary_sources':'SRC019; SRC020','release_status':'Advisory until causal allele/marker normalization is complete','review_priority':'P0'},
    {'catalog_id':'LOC019','canonical_symbol':'CMS cytoplasm','aliases':'cytoplasmic male sterility; sterile cytoplasm','gene_or_candidate':'Mitochondrial CMS determinants vary by system','trait_category':'Fertility','trait_scope':'Maternally inherited male sterility in defined CMS systems','species_scope':'Primarily C. annuum breeding systems','chromosome':'Mitochondrial genome','model_class':'Cytoplasmic inheritance modified by nuclear restorer loci and environment','inheritance_summary':'Sterile cytoplasm is maternally inherited; phenotype depends on nuclear Rf genes, modifiers, and temperature.','evidence_grade':'B','evidence_status':'Well-established biological system; molecular determinant varies among lines','genotype_prediction':'Maternal transmission exact at cytoplasm-state level','phenotype_prediction':'Conditional on specific CMS/Rf system','supported_claim':'CMS status follows maternal cytoplasm and can be restored by compatible nuclear genes.','prohibited_claim':'All pepper CMS systems share one universal mitochondrial allele or one universal Rf rule.','required_context':'Named CMS line/cytoplasm, maternal parent, Rf/Rf2/pr status, temperature.','primary_sources':'SRC021; SRC022; SRC023','release_status':'Advisory system-specific models only','review_priority':'P0'},
    {'catalog_id':'LOC020','canonical_symbol':'Rf / CaPPR6 candidate','aliases':'Restorer-of-fertility; CaRf','gene_or_candidate':'CaPPR6 and related PPR candidates in specific systems','trait_category':'Fertility','trait_scope':'Nuclear restoration of fertility in compatible CMS cytoplasm','species_scope':'C. annuum CMS/restorer populations','chromosome':'6','model_class':'Dominant nuclear restorer in specific CMS systems','inheritance_summary':'A major dominant locus often restores fertility, but modifiers, alternate Rf loci, and temperature matter.','evidence_grade':'B','evidence_status':'Fine-mapped strong candidate; not a universal proven single allele','genotype_prediction':'Exact locus segregation where marker/haplotype is validated','phenotype_prediction':'System-specific advisory only','supported_claim':'CaPPR6-region haplotypes are strongly associated with restoration in defined populations.','prohibited_claim':'CaPPR6 genotype universally predicts fertility across all CMS lines.','required_context':'CMS cytoplasm, restorer source, marker validity, temperature, modifier loci.','primary_sources':'SRC021; SRC022','release_status':'Advisory','review_priority':'P1'},
    {'catalog_id':'LOC021','canonical_symbol':'Rf2','aliases':'minor restorer-of-fertility locus','gene_or_candidate':'Capana06g000193 strong candidate','trait_category':'Fertility','trait_scope':'Additional fertility restoration in G164-derived material','species_scope':'C. annuum G164 and 77013A-derived populations','chromosome':'6','model_class':'Dominant minor restorer in a two-locus system','inheritance_summary':'Reported as a second dominant restorer locus; 15:1 segregation supported two dominant genes in source material.','evidence_grade':'B','evidence_status':'Fine-mapped strong candidate','genotype_prediction':'Exact in validated cross/model','phenotype_prediction':'Population-specific only','supported_claim':'Rf2 contributes to fertility restoration in the reported G164 CMS system.','prohibited_claim':'Rf2 is required or sufficient in every pepper CMS system.','required_context':'Exact CMS cytoplasm, Rf1 state, G164-derived haplotype, environment.','primary_sources':'SRC023','release_status':'Research/advisory','review_priority':'P2'},
    {'catalog_id':'LOC022','canonical_symbol':'cvr4','aliases':'Chilli veinal mottle virus resistance 4','gene_or_candidate':'Fine-mapped recessive locus; causal gene not finalized in this release','trait_category':'Virus resistance','trait_scope':'Resistance to ChiVMV in CV9-derived population','species_scope':'C. annuum CV9 × Jeju population','chromosome':'11','model_class':'Single recessive resistance locus in source population','inheritance_summary':'Reported 1 resistant:3 susceptible segregation in F2:3 families.','evidence_grade':'B','evidence_status':'Fine-mapped with gene-silencing support; causal normalization incomplete','genotype_prediction':'Exact locus segregation in validated population','phenotype_prediction':'Population/isolate-specific advisory','supported_claim':'A recessive cvr4 locus confers ChiVMV resistance in the reported CV9 material.','prohibited_claim':'cvr4 confers resistance to all ChiVMV isolates or other potyviruses.','required_context':'Causal allele/marker, virus isolate, genetic background.','primary_sources':'SRC024','release_status':'Research/advisory','review_priority':'P2'},
]

claims = []
for loc in loci:
    claims.append({
        'claim_id': f"CLM-{loc['catalog_id'][3:]}",
        'catalog_id': loc['catalog_id'],
        'claim_text': loc['supported_claim'],
        'claim_type': 'Production-supported' if loc['release_status'].startswith('MVP') else 'Advisory/research',
        'evidence_grade': loc['evidence_grade'],
        'applicability': loc['species_scope'],
        'required_conditions': loc['required_context'],
        'exclusions': loc['prohibited_claim'],
        'source_ids': loc['primary_sources'],
        'review_status': 'Curated seed record; independent domain review required before production release',
    })

standards = [
    {'standard':'MIAPPE 1.1','domain':'Phenotyping experiment metadata','adoption':'Adopt core concepts: Investigation, Study, Biological Material, Observation Unit, Observation Variable, Environment, Event.','url':'https://www.miappe.org/','source_id':'SRC027'},
    {'standard':'MCPD v2.1','domain':'Germplasm passport/provenance','adoption':'Map accession identifiers, institute codes, acquisition source, collecting data, biological status, and persistent identifiers.','url':'https://alliancebioversityciat.org/publications-data/faobioversity-multi-crop-passport-descriptors-v21-mcpd-v21-december-2015','source_id':'SRC028'},
    {'standard':'Descriptors for Capsicum','domain':'Crop characterization and evaluation','adoption':'Use as a vocabulary baseline, then map legacy terms to explicit modern observation variables and units.','url':'https://alliancebioversityciat.org/publications-data/descriptors-capsicum-capsicum-spp','source_id':'SRC029'},
    {'standard':'BrAPI','domain':'Breeding data interoperability','adoption':'Design identifiers and entities to permit later selective BrAPI endpoints for germplasm, studies, observations, and marker data.','url':'https://brapi.org/','source_id':'SRC030'},
    {'standard':'Pepper Genomics Database','domain':'Reference assemblies and variation','adoption':'Store assembly name/version with every coordinate and gene identifier; maintain lift-over mappings rather than one canonical coordinate.','url':'https://ted.bti.cornell.edu/cgi-bin/pepper/index','source_id':'SRC026'},
]

backlog = [
    {'priority':'P0','work_item':'Independent plant geneticist review','reason':'All production claims and evidence grades require second-person scientific review.','acceptance_gate':'Reviewer signs each active claim and records conflicts/corrections.'},
    {'priority':'P0','work_item':'Allele-level Pun1 and pAMT catalog','reason':'Current rows describe loci; the calculator needs exact named alleles, sequence changes, species, markers, and reference sequences.','acceptance_gate':'Every active allele has primary source, sequence-level variant, assay, species, and null/leaky/functional classification.'},
    {'priority':'P0','work_item':'Reference assembly normalization','reason':'Gene IDs and positions differ across CM334, Zunla-1, Dempsey, Zhangshugang, and pan-genome resources.','acceptance_gate':'Every coordinate includes assembly/version; cross-build mappings are versioned and tested.'},
    {'priority':'P0','work_item':'Pathogen interaction tables','reason':'Resistance predictions require pathogen species, strain/pathotype, effector, and temperature context.','acceptance_gate':'No disease phenotype rule can execute without a compatible pathogen-context record.'},
    {'priority':'P0','work_item':'Color multi-locus model curation','reason':'PSY1, PSY2, CCS, ZEP, SGR, GLK2, and PRR2 interact; single-gene color labels are unsafe.','acceptance_gate':'Only source-replicated haplotype combinations are activated; unknown combinations return no prediction.'},
    {'priority':'P1','work_item':'Anthocyanin locus expansion','reason':'CaAN2, CaAN3/CaPs, Ca3GT, MBW regulators, tissue specificity, and developmental stage require separate records.','acceptance_gate':'Distinct phenotype models for full purple, stripes, foliage, flowers, and cotyledons.'},
    {'priority':'P1','work_item':'CMS/Rf system registry','reason':'Multiple cytoplasms and restorer haplotypes make generic Rf predictions invalid.','acceptance_gate':'Each model names maternal CMS line/cytoplasm, nuclear loci, markers, temperature range, and source population.'},
    {'priority':'P1','work_item':'Trait ontology and units','reason':'Raw observations must be comparable and computationally reusable.','acceptance_gate':'Every observation variable has trait, method, unit, scale, growth stage, and ontology mappings where available.'},
    {'priority':'P1','work_item':'Public dataset ingestion licenses','reason':'Publicly accessible is not always unrestricted for redistribution.','acceptance_gate':'Each imported dataset records license, redistribution rights, attribution, and retrieval date.'},
    {'priority':'P2','work_item':'QTL evidence registry','reason':'QTLs are valuable but must retain population, map, marker interval, effect, and environment rather than becoming universal genes.','acceptance_gate':'QTL records are not used for deterministic predictions and remain tied to study/population/reference build.'},
    {'priority':'P2','work_item':'Quantitative model readiness assessment','reason':'SHU, fruit size, yield, flavor, and wall thickness require empirical training data.','acceptance_gate':'No model release without training cohort, held-out validation, uncertainty intervals, and model card.'},
]

# Styles
DARK = '17365D'
MID = 'D9EAF7'
GREEN = 'E2F0D9'
ORANGE = 'FCE4D6'
RED = 'F4CCCC'
PURPLE = 'E4DFEC'
GRAY = 'E7E6E6'
TEAL = 'DDEBF7'
WHITE = 'FFFFFF'
BLACK = '000000'
IMPORTED_GREEN = '008000'
STATIC_GRAY = '666666'
CAUTION_ORANGE = 'C65911'

wb = Workbook()
wb.remove(wb.active)

thin_gray = Side(style='thin', color='B7B7B7')
header_fill = PatternFill('solid', fgColor=DARK)
sub_fill = PatternFill('solid', fgColor=MID)
warn_fill = PatternFill('solid', fgColor=ORANGE)
flag_fill = PatternFill('solid', fgColor=RED)
review_fill = PatternFill('solid', fgColor=PURPLE)
static_fill = PatternFill('solid', fgColor=GRAY)


def style_header(ws, row=1):
    for cell in ws[row]:
        if cell.value is not None:
            cell.fill = header_fill
            cell.font = Font(color=WHITE, bold=True)
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.row_dimensions[row].height = 32


def auto_width(ws, min_w=10, max_w=60):
    for col_cells in ws.columns:
        letter = get_column_letter(col_cells[0].column)
        max_len = 0
        for c in col_cells:
            if c.value is None:
                continue
            text = str(c.value)
            max_line = max((len(line) for line in text.split('\n')), default=0)
            max_len = max(max_len, max_line)
        ws.column_dimensions[letter].width = min(max(max_len + 2, min_w), max_w)


def add_table(ws, name):
    if ws.max_row < 2 or ws.max_column < 1:
        return
    ref = f"A1:{get_column_letter(ws.max_column)}{ws.max_row}"
    tab = Table(displayName=name, ref=ref)
    tab.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2', showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
    ws.add_table(tab)

# README sheet
ws = wb.create_sheet('README')
ws.sheet_view.showGridLines = False
ws.merge_cells('A1:H1')
ws['A1'] = 'Capsicum Genetics Evidence Catalog v0.1'
ws['A1'].fill = header_fill
ws['A1'].font = Font(color=WHITE, bold=True, size=16)
ws['A1'].alignment = Alignment(horizontal='left', vertical='center')
ws.row_dimensions[1].height = 28

readme_rows = [
    ('Purpose','A curated seed dataset for a science-backed pepper breeding calculator and breeding-record platform. It separates verified genetic claims from advisory evidence and unsupported prediction.'),
    ('Release status','Research seed release. Not a clinically, commercially, or legally validated breeding decision system. Independent plant-genetics review is required before activating production phenotype rules.'),
    ('Core rule','Genotype inheritance may be exact when parental alleles are verified. Phenotype prediction is enabled only when the literature supports the exact allele, population/background, interaction model, and pathogen/environment context.'),
    ('Evidence A','Causal or functionally validated gene/allele with strong genetic/mechanistic evidence. Still subject to applicability limits.'),
    ('Evidence B','Fine-mapped strong candidate, population-specific model, linked marker, or replicated major-effect evidence. Advisory by default.'),
    ('Evidence C','Association, expression, candidate, or QTL evidence without sufficient causal validation. Not included as production rules in this seed catalog.'),
    ('Critical nonclaim','This catalog does not predict exact SHU, flavor, yield, fruit weight, wall thickness, or environmental adaptation from cultivar names or parent phenotypes.'),
    ('Source policy','Use primary peer-reviewed studies for scientific claims; reviews and official databases guide discovery and normalization but do not replace primary evidence.'),
    ('Versioning','Every future prediction run must store catalog version, exact source assertions, parental call status, and assembly/version for genomic coordinates.'),
]
for r, (k,v) in enumerate(readme_rows, start=3):
    ws[f'A{r}'] = k
    ws[f'A{r}'].font = Font(bold=True, color=DARK)
    ws[f'A{r}'].fill = sub_fill
    ws[f'B{r}'] = v
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    ws[f'B{r}'].alignment = Alignment(wrap_text=True, vertical='top')
    ws.row_dimensions[r].height = 42 if len(v) > 180 else 30

ws['A14'] = 'Workbook contents'
ws['A14'].font = Font(bold=True, color=WHITE)
ws['A14'].fill = header_fill
contents = [
    ('Locus_Catalog','Curated loci/genes with evidence grade, allowed claim, forbidden claim, and prediction eligibility.'),
    ('Evidence_Claims','Atomic claim records suitable for a future approval and versioning workflow.'),
    ('Sources','Bibliographic source registry with DOI/PMID/URL and study limitations.'),
    ('Standards','Data standards and official resources to adopt.'),
    ('Research_Backlog','Required work before production release and advanced model development.'),
    ('Data_Dictionary','Field definitions for implementation.'),
    ('Change_Log','Dataset release history.'),
]
for i,(name,desc) in enumerate(contents, start=15):
    ws[f'A{i}'] = name
    ws[f'A{i}'].font = Font(bold=True, color=DARK)
    ws[f'B{i}'] = desc
    ws.merge_cells(start_row=i, start_column=2, end_row=i, end_column=8)
    ws[f'B{i}'].alignment = Alignment(wrap_text=True)

ws.column_dimensions['A'].width = 25
for col in 'BCDEFGH':
    ws.column_dimensions[col].width = 18

# Generic writer
def write_records(sheet_name, records, table_name):
    ws = wb.create_sheet(sheet_name)
    ws.sheet_view.showGridLines = False
    headers = list(records[0].keys())
    ws.append(headers)
    for rec in records:
        ws.append([rec[h] for h in headers])
    style_header(ws)
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = f"A1:{get_column_letter(ws.max_column)}{ws.max_row}"
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical='top', wrap_text=True)
            cell.font = Font(color=IMPORTED_GREEN if cell.column in {len(headers)-1} else BLACK)
    add_table(ws, table_name)
    auto_width(ws)
    return ws

ws_loci = write_records('Locus_Catalog', loci, 'LocusCatalog')
# Color evidence and release statuses
headers_loci = {c.value:i for i,c in enumerate(ws_loci[1], start=1)}
for r in range(2, ws_loci.max_row+1):
    grade = ws_loci.cell(r, headers_loci['evidence_grade'])
    grade.fill = PatternFill('solid', fgColor=GREEN if grade.value == 'A' else ORANGE if grade.value == 'B' else RED)
    grade.font = Font(bold=True)
    release = ws_loci.cell(r, headers_loci['release_status'])
    if str(release.value).startswith('MVP'):
        release.fill = PatternFill('solid', fgColor=GREEN)
    elif 'blocked' in str(release.value).lower() or 'research' in str(release.value).lower():
        release.fill = review_fill
    else:
        release.fill = warn_fill
    pred = ws_loci.cell(r, headers_loci['phenotype_prediction'])
    if 'Blocked' in str(pred.value) or 'Not eligible' in str(pred.value):
        pred.fill = flag_fill
    elif 'Conditional' in str(pred.value) or 'conditional' in str(pred.value):
        pred.fill = warn_fill

ws_claims = write_records('Evidence_Claims', claims, 'EvidenceClaims')
ws_sources = write_records('Sources', sources, 'SourceRegistry')
# Hyperlinks and imported source styling
headers_src = {c.value:i for i,c in enumerate(ws_sources[1], start=1)}
for r in range(2, ws_sources.max_row+1):
    cell = ws_sources.cell(r, headers_src['url'])
    cell.hyperlink = cell.value
    cell.style = 'Hyperlink'
    for field in ['year','title','authors','journal','doi','pmid','source_type','open_access','key_use','limitations']:
        ws_sources.cell(r, headers_src[field]).font = Font(color=IMPORTED_GREEN)

ws_standards = write_records('Standards', standards, 'StandardsRegistry')
headers_std = {c.value:i for i,c in enumerate(ws_standards[1], start=1)}
for r in range(2, ws_standards.max_row+1):
    c = ws_standards.cell(r, headers_std['url'])
    c.hyperlink = c.value
    c.style = 'Hyperlink'

ws_backlog = write_records('Research_Backlog', backlog, 'ResearchBacklog')
headers_back = {c.value:i for i,c in enumerate(ws_backlog[1], start=1)}
for r in range(2, ws_backlog.max_row+1):
    p = ws_backlog.cell(r, headers_back['priority'])
    p.fill = PatternFill('solid', fgColor=RED if p.value == 'P0' else ORANGE if p.value == 'P1' else GRAY)
    p.font = Font(bold=True)

# Data dictionary
data_dictionary = [
    {'field':'catalog_id','entity':'Locus_Catalog','definition':'Stable internal identifier for a curated locus/model record.','required':'Yes','validation':'LOC followed by three digits.','notes':'Never reuse after retirement.'},
    {'field':'canonical_symbol','entity':'Locus_Catalog','definition':'Preferred scientific symbol for display and search.','required':'Yes','validation':'Controlled string plus aliases.','notes':'Do not infer dominance from capitalization.'},
    {'field':'species_scope','entity':'Locus_Catalog','definition':'Species, accession, cross, or population in which evidence applies.','required':'Yes','validation':'Taxon plus free-text population/source identifiers.','notes':'Broad Capsicum claims require evidence across species.'},
    {'field':'chromosome','entity':'Locus_Catalog','definition':'Chromosome or cytoplasmic genome assignment.','required':'Conditional','validation':'Must include reference assembly/version in implementation.','notes':'This seed sheet omits coordinates until lift-over normalization.'},
    {'field':'model_class','entity':'Locus_Catalog','definition':'Inheritance or interaction model supported by evidence.','required':'Yes','validation':'Controlled enum in production.','notes':'Examples: nuclear Mendelian, linked, cytoplasmic, host–pathogen interaction, quantitative.'},
    {'field':'evidence_grade','entity':'Locus_Catalog/Evidence_Claims','definition':'A/B/C/U scientific evidence classification.','required':'Yes','validation':'Controlled enum and approval record.','notes':'Grade is not confidence percentage.'},
    {'field':'genotype_prediction','entity':'Locus_Catalog','definition':'Whether allele segregation can be computed and under what conditions.','required':'Yes','validation':'Controlled eligibility state.','notes':'Exact segregation still requires verified parental calls.'},
    {'field':'phenotype_prediction','entity':'Locus_Catalog','definition':'Eligibility and constraints for translating genotype to phenotype.','required':'Yes','validation':'Blocked, advisory, conditional, or approved.','notes':'Default should be blocked.'},
    {'field':'supported_claim','entity':'Locus_Catalog','definition':'Narrow statement the cited evidence supports.','required':'Yes','validation':'Human-reviewed atomic claim.','notes':'Avoid compound or universal claims.'},
    {'field':'prohibited_claim','entity':'Locus_Catalog','definition':'Common overgeneralization that the software must not emit.','required':'Yes','validation':'Human-reviewed safety boundary.','notes':'Use in UI and model tests.'},
    {'field':'required_context','entity':'Locus_Catalog','definition':'Inputs that must be present before a model can run.','required':'Yes','validation':'Machine-readable requirements in production.','notes':'May include pathogen isolate, other loci, stage, environment, or assay.'},
    {'field':'source_id','entity':'Sources','definition':'Stable identifier for a publication, standard, or official resource.','required':'Yes','validation':'SRC followed by three digits.','notes':'Assertions should link through a join table in production.'},
    {'field':'assembly_version','entity':'Future genotype/coordinate tables','definition':'Reference genome build used for a gene ID or coordinate.','required':'Yes for coordinates','validation':'Controlled assembly registry.','notes':'Never store a naked coordinate.'},
    {'field':'call_method','entity':'Future genotype_call','definition':'How a genotype was obtained.','required':'Yes','validation':'sequencing, marker assay, pedigree inference, phenotype inference, assumption, unknown.','notes':'Assumption is not verification.'},
    {'field':'review_status','entity':'Evidence_Claims','definition':'Scientific governance state for an assertion.','required':'Yes','validation':'draft, reviewed, approved, rejected, retired.','notes':'Production rules require approved status.'},
]
ws_dd = write_records('Data_Dictionary', data_dictionary, 'DataDictionary')

# Change log
change_log = [
    {'version':'0.1','date':'2026-07-22','status':'Research seed release','changes':'Created evidence-governed schema and curated 22 high-priority locus/model records with 30 sources.','known_gaps':'No complete allele sequence catalog, assembly lift-over, marker validation table, or independent scientific sign-off.'}
]
ws_cl = write_records('Change_Log', change_log, 'ChangeLog')

# Add comments to critical headers
for ws_name in ['Locus_Catalog','Evidence_Claims','Sources']:
    sh = wb[ws_name]
    for cell in sh[1]:
        if cell.value in {'evidence_grade','phenotype_prediction','supported_claim','prohibited_claim','limitations'}:
            cell.comment = Comment('This field is a scientific governance control and must be reviewed before production use.', 'OpenAI')

# Page setup and common formatting
for sh in wb.worksheets:
    sh.sheet_properties.pageSetUpPr.fitToPage = True
    sh.page_setup.fitToWidth = 1
    sh.page_setup.fitToHeight = 0
    sh.sheet_view.zoomScale = 85
    for row in sh.iter_rows():
        for cell in row:
            if cell.row != 1 and sh.title != 'README':
                cell.alignment = Alignment(vertical='top', wrap_text=True)

# Save
wb.save(XLSX)

# CSVs
with LOCUS_CSV.open('w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=list(loci[0].keys()))
    writer.writeheader(); writer.writerows(loci)
with SOURCES_CSV.open('w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=list(sources[0].keys()))
    writer.writeheader(); writer.writerows(sources)

README_MD.write_text('''# Capsicum Genetics Evidence Catalog v0.1\n\nThis research seed dataset contains 22 curated Capsicum locus/model records, 22 atomic evidence claims, 30 publication/standard/resource records, a data dictionary, standards map, and a production-readiness backlog.\n\n## Use\n\nUse the workbook as the initial scientific catalog for a pepper breeding planner. It is deliberately conservative: exact genotype segregation may be implemented for verified parental alleles, while phenotype rules remain conditional or blocked unless the exact literature-supported context is present.\n\n## Nonclaims\n\nThe dataset does not support exact SHU, flavor, fruit weight, yield, wall thickness, or climate-adaptation predictions from cultivar names or parental phenotype values.\n\n## Required before production\n\n1. Independent plant geneticist review.\n2. Allele-level sequence and marker catalog.\n3. Reference assembly/version normalization.\n4. Pathogen strain/pathotype interaction registry.\n5. Multi-locus mature and immature fruit-color rule curation.\n6. Scientific approval and versioning workflow.\n\nAll source URLs are included directly in the workbook and CSV source registry.\n''', encoding='utf-8')

# Verification
check = load_workbook(XLSX, data_only=False)
assert check.sheetnames == ['README','Locus_Catalog','Evidence_Claims','Sources','Standards','Research_Backlog','Data_Dictionary','Change_Log']
assert check['Locus_Catalog'].max_row == len(loci)+1
assert check['Sources'].max_row == len(sources)+1
assert check['Evidence_Claims'].max_row == len(claims)+1
print(XLSX)
print(LOCUS_CSV)
print(SOURCES_CSV)
print(README_MD)
print('sheets', check.sheetnames)
print('loci', len(loci), 'sources', len(sources), 'claims', len(claims))
