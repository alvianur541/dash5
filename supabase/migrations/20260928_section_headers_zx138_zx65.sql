-- Headerless chunks (ZX138MF-5G all manuals, ZX65USB-5A Workshop & Brosur) get the same header lines as the other units:
-- "Section: <SECTION> - <Group N component> - <sub-heading>", rebuilt by carrying markdown headings forward in id order.
-- Idempotent: rows that already start with "Section:" are skipped. Embeddings are not recomputed.
begin;
update documents set content = $hdr$Section: WORKSHOP MANUAL - Cover & Contents
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 741 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INTRODUCTION - Units Used
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 742 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SYMBOL AND ABBREVIATION
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 743 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Follow Safety Instructions
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 744 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - General Precautions for Cab
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 745 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Jump Starting
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 746 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Provide Signals for Jobs Involving Multiple Machines
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 747 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 748 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Avoid Tipping
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 749 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Park Machine Safely
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 750 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Practice Safe Maintenance
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 751 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Prevent Burns
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 752 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Clean up Flammables
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 753 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Remove Paint Before Welding or Heating
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 754 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Precaution for Communication Terminal Equipment
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 755 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION AND GROUP CONTENTS - SECTION 5 FRONT ATTACHMENT
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 756 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 1 Precautions for Disassembling and Assembling
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 757 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 1 Precautions for Disassembling and Assembling
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 758 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 759 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 760 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 761 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 762 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 763 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 764 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Painting
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 765 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 4 Bleeding Air
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 766 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 6 Preparation
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 767 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 1 Upperstructure
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 768 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 769 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 770 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 771 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 772 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 3 Front Attachment
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 773 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 3 Front Attachment
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 774 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 3 Front Attachment
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 775 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 3 Front Attachment
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 776 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: UPPERSTRUCTURE
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 777 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 778 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 779 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 780 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 781 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 782 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 2 Counterweight
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 783 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 784 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 785 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 786 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 787 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 788 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 789 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 790 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 791 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 5 Pump Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 792 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 793 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 794 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 795 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 796 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 797 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 798 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 799 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 800 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 801 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 802 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 803 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 804 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 805 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 806 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 807 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 6 Control Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 808 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 7 Swing Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 809 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 7 Swing Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 810 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 7 Swing Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 811 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 7 Swing Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 812 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 7 Swing Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 813 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 7 Swing Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 814 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 7 Swing Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 815 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 816 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 817 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 818 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 819 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 820 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 821 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 822 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 823 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 824 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 825 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 826 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 827 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 828 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 829 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 830 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 831 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 832 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 833 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pilot Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 834 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Solenoid Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 835 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 836 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Solenoid Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 837 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Revolution Sensing Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 838 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Revolution Sensing Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 839 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Revolution Sensing Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 840 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Auxiliary Flow Rate Selector Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 841 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Auxiliary Flow Rate Selector Valve
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 842 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: UNDERCARRIAGE
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 843 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 1 Swing Bearing
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 844 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 845 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 846 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 847 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 848 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 849 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 850 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 851 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Center Joint
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 852 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Center Joint
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 853 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Center Joint
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 854 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Center Joint
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 855 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 856 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 4 Track Adjuster
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 857 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 4 Track Adjuster
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 858 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 4 Track Adjuster
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 859 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Front Idler
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 860 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Front Idler
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 861 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Front Idler
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 862 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 6 Upper and Lower Rollers
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 863 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 6 Upper and Lower Rollers
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 864 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 6 Upper and Lower Rollers
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 865 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 7 Track
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 866 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDER
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 867 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 7 Track
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 868 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 8 Blade Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 869 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 8 Blade Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 870 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 8 Blade Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 871 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 8 Blade Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 872 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 1 Front Attachment
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 873 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 1 Front Attachment
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 874 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 875 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 876 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 877 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 878 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 879 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 880 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 881 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 882 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 883 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 884 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 885 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 886 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 887 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 888 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 889 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 890 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SERVICE MANUAL REVISION REQUEST FORM
Model: ZX65USB-5A
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 892 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ZAXIS 65USB
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 893 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: OPERATOR COMFORT - Comfortable Operator Stations to Yield High Production
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 894 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: DURABILITY - Sturdy Upperstructure
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 895 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SPECIFICATIONS - WEIGHTS AND GROUND PRESSURE
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 896 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SPECIFICATIONS - WORKING RANGES
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 897 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MACHINE CAPACITIES - ZX65USB-5A, Blade above Ground
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 898 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MACHINE CAPACITIES - ZX65USB-5A, Blade on Ground
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 899 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MACHINE CAPACITIES - ZX65USB-5A, Blade above Ground
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 900 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EQUIPMENT
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 901 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EQUIPMENT
Model: ZX65USB-5A
Kategori: BROSUR MANUAL

$hdr$ || content where id = 903 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: WORKSHOP MANUAL - Cover & Contents
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1604 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: UPPERSTRUCTURE
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1605 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: UNDERCARRIAGE
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1606 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INTRODUCTION - Manual Composition
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1607 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INTRODUCTION - Units Used
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1608 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SYMBOL AND ABBREVIATION
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1609 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Prepare for Emergencies
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1610 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Ensure Safety Before Rising from or Leaving Operator’s Seat
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1611 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Investigate Job Site Beforehand
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1612 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1613 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Keep Person Clear from Working Area
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1614 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1615 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Practice Safe Maintenance
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1616 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Store Attachments Safely
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1617 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Check Key Switch
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1618 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Beware of Asbestos and
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1619 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Precaution for Communication Terminal Equipment
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1620 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: GENERAL
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1621 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 1 Precautions for Disassembling and Assembling
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1622 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 1 Precautions for Disassembling and Assembling
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1623 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1624 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1625 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1626 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1627 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Tightening
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1628 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Painting
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1629 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 4 Bleeding Air
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1630 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 5 Preparation
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1631 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAINTENANCE STANDARD
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1632 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 1 Upperstructure
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1633 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 1 Upperstructure - Diagram showing a cross-sectional view of the swing parking brake assembly with 
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1634 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1635 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1636 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1637 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1638 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1639 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 2 Undercarriage
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1640 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 3 Front Attachment
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1641 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 3 Front Attachment
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1642 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 3 Front Attachment
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1643 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 MAINTENANCE STANDARD - Group 3 Front Attachment
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1644 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: UPPERSTRUCTURE
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1645 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1646 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1647 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1648 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1649 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1650 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1651 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1652 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1653 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1654 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1655 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1656 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 1 Cab
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1657 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 3 Main Frame
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1658 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 3 Main Frame
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1659 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 3 Main Frame
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1660 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 4 Engine
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1661 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 4 Engine
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1662 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 4 Engine
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1663 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 4 Engine
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1664 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 4 Engine
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1665 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 4 Engine
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1666 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 4 Engine
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1667 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1668 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1669 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1670 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1671 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1672 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1673 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1674 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1675 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1676 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1677 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1678 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1679 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1680 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1681 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1682 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1683 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 8 Pump Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1684 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1685 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1686 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1687 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1688 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1689 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1690 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1691 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1692 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1693 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1694 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1695 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1696 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1697 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1698 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1699 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1700 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1701 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1702 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1703 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1704 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1705 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1706 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1707 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1708 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1709 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1710 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1711 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1712 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1713 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1714 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 9 Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1715 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1716 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1717 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1718 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1719 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1720 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1721 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1722 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1723 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1724 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1725 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1726 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1727 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 10 Swing Device
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1728 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1729 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1730 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1731 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1732 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1733 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1734 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1735 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1736 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1737 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1738 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1739 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1740 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1741 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1742 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 11 Pilot Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1743 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 12 Solenoid Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1744 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 12 Solenoid Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1745 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 12 Solenoid Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1746 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 12 Solenoid Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1747 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPER STRUCTURE - Group 12 Solenoid Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1748 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 13 Signal Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1749 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 UPPERSTRUCTURE - Group 13 Signal Control Valve
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1750 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: UNDERCARRIAGE
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1751 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 1 Swing Bearing
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1752 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 1 Swing Bearing
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1753 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 1 Swing Bearing
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1754 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1755 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1756 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1757 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1758 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1759 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1760 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1761 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1762 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1763 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1764 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1765 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1766 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 2 Travel Device (ZX130-5G) - Precautions for Using Floating Seal
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1767 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1768 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1769 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1770 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1771 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1772 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1773 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1774 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1775 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1776 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1777 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1778 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G)
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1779 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 3 Travel Device (ZX110MF-5G/138MF-5G) - Precautions for Using Floating Seal
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1780 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 4 Center Joint
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1781 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 4 Center Joint
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1782 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 4 Center Joint
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1783 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Track Adjuster
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1784 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Track Adjuster
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1785 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Track Adjuster
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1786 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Track Adjuster
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1787 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Track Adjuster
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1788 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Track Adjuster
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1789 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1790 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 5 Track Adjuster
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1791 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 6 Front Idler
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1792 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 6 Front Idler
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1793 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 6 Front Idler
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1794 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 6 Flont Idler - Precautions for Using Floating Seal
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1795 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 7 Upper and Lower Rollers
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1796 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 7 Upper and Lower Rollers
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1797 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 7 Upper and Lower Rollers
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1798 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 7 Upper and Lower Rollers
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1799 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 7 Upper and Lower Roller
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1800 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 8 Track
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1801 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 UNDERCARRIAGE - Group 8 Track
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1802 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 1 Front Attachment
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1803 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 1 Front Attachment
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1804 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1805 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1806 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACH
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1807 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1808 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1809 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1810 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1811 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1812 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1813 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1814 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1815 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1816 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1817 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 FRONT ATTACHMENT - Group 2 Cylinder
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1818 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SERVICE MANUAL REVISION REQUEST FORM
Model: ZX138MF-5G
Kategori: WORKSHOP MANUAL

$hdr$ || content where id = 1820 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: zaxis 138MF
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1821 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Durability - Strengthened Travel
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1822 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SPECIFICATIONS - UPPERSTRUCTURE
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1823 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SPECIFICATIONS - WEIGHT: BASIC MACHINE AND COMPONENTS
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1824 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SPECIFICATIONS - DIMENSIONS
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1825 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: LIFTING CAPACITIES (Without Bucket)
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1826 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EQUIPMENT
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1827 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EQUIPMENT
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1828 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EQUIPMENT
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1829 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EQUIPMENT
Model: ZX138MF-5G
Kategori: BROSUR MANUAL

$hdr$ || content where id = 1831 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 138MF-5G
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1832 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INTRODUCTION - Units Used
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1833 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SYMBOL AND ABBREVIATION
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1834 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION AND GROUP CONTENTS - SECTION 3 COMPONENT OPERATION
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1835 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 1 Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1836 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 1 Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1837 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 1 Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1838 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 1 Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1839 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Component Layout
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1840 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Component Layout
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1841 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 2 Component Layout
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1842 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1843 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1844 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1845 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1846 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1847 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1848 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1849 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1850 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1851 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 1 GENERAL - Group 3 Component Specifications
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1852 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 1 Controller
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1853 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1854 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1855 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1856 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1857 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1858 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1859 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1860 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1861 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1862 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1863 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1864 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1865 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1866 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1867 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1868 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1869 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1870 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1871 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1872 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1873 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1874 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1875 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1876 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1877 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1878 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 2 Control System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1879 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1880 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1881 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1882 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1883 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1884 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1885 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1886 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1887 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1888 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 3 Hydraulic System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1889 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1890 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1891 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1892 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1893 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1894 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1895 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1896 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1897 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 2 SYSTEM - Group 4 Electrical System
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1898 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: COMPONENT OPERATION
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1899 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1900 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1901 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1902 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1903 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1904 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1905 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1906 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1907 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1908 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1909 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1910 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1911 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1912 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1913 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1914 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1915 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1916 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 1 Pump Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1917 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 2 Swing Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1918 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 2 Swing Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1919 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 2 Swing Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1920 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1921 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1922 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1923 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1924 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1925 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1926 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1927 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1928 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1929 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1930 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1931 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1932 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1933 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1934 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1935 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1936 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1937 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1938 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1939 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1940 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1941 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 3 Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1942 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 4 Pilot Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1943 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 4 Pilot Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1944 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 4 Pilot Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1945 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 4 Pilot Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1946 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 4 Pilot Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1947 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 4 Pilot Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1948 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 4 Pilot Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1949 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1950 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1951 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1952 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1953 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1954 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1955 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1956 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1957 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1958 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 5 Travel Device
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1959 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 6 Signal Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1960 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 6 Signal Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1961 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 6 Signal Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1962 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 6 Signal Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1963 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 6 Signal Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1964 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 6 Signal Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1965 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 6 Signal Control Valve
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1966 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 7 Others (Upperstructure)
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1967 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 7 Others (Upperstructure)
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1968 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 8 Others (Undercarriage)
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1969 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 3 COMPONENT OPERATION - Group 8 Others (Undercarriage)
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1970 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SERVICE MANUAL REVISION REQUEST FORM
Model: ZX138MF-5G
Kategori: OPERATIONAL PRINCIPLE

$hdr$ || content where id = 1972 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 138MF-5G
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1973 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Understand Signal Words
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1974 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Wear Protective Clothing
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1975 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Fasten Your Seat Belt
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1976 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Investigate Job Site Beforehand
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1977 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Drive Machine Safely
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1978 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Avoid Injury from Back-Over and Swing Accidents
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1979 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Operate with Caution
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1980 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Transport Safely
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1981 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Prevent Parts from Flying
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1982 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Prevent Fires
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1983 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Precautions for Handling Accumulator and
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1984 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Dispose of Waste Properly
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1985 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SAFETY - Notes on Protection of Operator’s Station when the Machine Rolls Over
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1986 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION AND GROUP CONTENTS
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1987 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: OPERATIONAL PERFORMANCE TEST
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1988 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1989 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1990 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1991 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1992 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1993 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1994 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1995 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1996 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1997 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1998 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 1999 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2000 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2001 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2002 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2003 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2004 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2005 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2006 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2007 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2008 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2009 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2010 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2011 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2012 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2013 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2014 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2015 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 2 Standard
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2016 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 3 Engine Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2017 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 3 Engine Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2018 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 4 Machine Performance Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2019 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 4 Machine Performance Test - Swing Speed
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2020 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 4 Machine Performance Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2021 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 4 Machine
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2022 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 4 Machine Performance Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2023 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 4 Machine Performance Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2024 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 4 Machine Performance Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2025 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 4 Machine Performance Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2026 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2027 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2028 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2029 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2030 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2031 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2032 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2033 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2034 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2035 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2036 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2037 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 5 Component Test
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2038 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 6 Adjustment
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2039 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 4 OPERATIONAL PERFORMANCE TEST - Group 6 Adjustment
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2040 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: TROUBLESHOOTING
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2041 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: TROUBLESHOOTING
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2042 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2043 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2044 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2045 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2046 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2047 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2048 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2049 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2050 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2051 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 1 Diagnosing Procedure
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2052 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 2 Monitor
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2053 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 2 Monitor
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2054 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 2 Monitor
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2055 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 3 e-Service
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2056 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 3 e-Service
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2057 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2058 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2059 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2060 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2061 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2062 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2063 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2064 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2065 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2066 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2067 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2068 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2069 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLE
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2070 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 4 Component Layout
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2071 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2072 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2073 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2074 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2075 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2076 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2077 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2078 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2079 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2080 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2081 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2082 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2083 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2084 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2085 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2086 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2087 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2088 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2089 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2090 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2091 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2092 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2093 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2094 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2095 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2096 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2097 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2098 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2099 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2100 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 5 Troubleshooting A
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2101 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2102 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2103 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2104 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2105 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2106 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2107 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2108 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2109 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2110 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2111 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2112 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2113 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2114 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2115 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2116 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2117 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2118 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2119 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2120 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2121 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2122 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2123 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2124 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2125 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2126 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2127 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2128 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2129 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2130 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2131 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2132 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2133 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2134 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2135 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2136 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2137 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2138 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2139 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2140 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2141 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2142 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2143 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2144 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2145 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2146 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2147 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2148 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2149 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 6 Troubleshooting B
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2150 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2151 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2152 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2153 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2154 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2155 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2156 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2157 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2158 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2159 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2160 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2161 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2162 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2163 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2164 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2165 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2166 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 7 Troubleshooting C
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2167 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2168 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2169 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2170 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2171 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2172 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2173 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2174 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2175 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2176 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2177 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2178 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2179 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2180 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2181 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2182 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2183 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2184 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2185 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2186 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2187 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2188 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2189 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SECTION 5 TROUBLESHOOTING - Group 8 Air Conditioner
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2190 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: The Attached Diagram List
Model: ZX138MF-5G
Kategori: TECHNICAL MANUAL

$hdr$ || content where id = 2192 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 4BG1
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2193 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: GENERAL INFORMATION
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2194 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 1–4 GENERAL INFORMATION
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2195 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: GENERAL INFORMATION - MAIN DATA AND SPECIFICATIONS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2196 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: PERFORMANCE CURVE - MODEL CC-4BG1TCG
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2197 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: GENERAL INFORMATION - MODEL BB-4BG1TRG
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2198 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EXTERNAL VIEW - MODEL BB-4BG1TRG
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2199 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: TIGHTENING TORQUE SPECIFICATIONS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2200 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: TIGHTENING TORQUE SPECIFICATIONS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2201 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: TIGHTENING TORQUE SPECIFICATIONS - FLANGED HEAD BOLT
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2202 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAJOR PART FIXING NUTS AND BOLTS - Cylinder Head and Cover
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2203 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Oil Pan, Timing Gear Case and Cover, Water Pump, Oil Cooler, Oil Cover
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2204 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Fuel System
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2205 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAINTENANCE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2206 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 2–4 MAINTENANCE - Adjusting Procedure
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2207 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAINTENANCE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2208 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAINTENANCE - INJECTION TIMING
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2209 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAINTENANCE - COMPRESSION PRESSURE MEASUREMENT
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2210 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY I (DISASSEMBLY)
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2211 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY I - MAJOR COMPONENTS - I
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2212 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAJOR COMPONENTS - II - Disassembly Steps
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2213 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CYLINDER HEAD DISASSEMBLY STEPS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2214 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY II - (INSPECTION & REPAIR)
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2215 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: VALVE GUIDE - Valve Guide Replacement
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2216 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY II - Valve Seat Insert Replacement
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2217 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY II - PUSH ROD
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2218 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY II - CAMSHAFT
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2219 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY II - Cylinder Liner Replacement
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2220 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Piston
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2221 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Piston Selection
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2222 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: PISTON PIN - Piston Pin and Piston Clearance
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2223 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY II - Connecting Rod Bearing Inspection
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2224 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Crankshaft Journal Bearing Inside Diameter
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2225 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Crankshaft Pin Bearing Clearance
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2226 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY III (REASSEMBLY)
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2227 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CYLINDER HEAD REASSEMBLY STEPS - Reassembly Steps
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2228 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAJOR COMPONENT REASSEMBLY STEPS I
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2229 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY III - 6. Timing Gear Case
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2230 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY III - 13. Oil Pan
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2231 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Important Operations - 4. Flywheel
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2232 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ASSEMBLY III - 14. Rocker Arm and Rocker Arm Shaft
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2233 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EXTERNAL PARTS REASSEMBLY STEPS (Right-hand Side)
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2234 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Engine Assembly III - 13. Fan guide
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2235 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE TUNING OPERATION - Reference
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2236 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: OIL PUMP - DISASSEMBLY
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2237 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: COOLING SYSTEM - GENERAL DESCRIPTION
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2238 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INJECTION NOZZLE - DISASSEMBLY
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2239 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INJECTION PUMP CALIBRATION DATA - IDENTIFICATION PLATE AND PRODUCT SERIAL NUMBER
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2240 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INJ. PUMP CALIBRATION DATA - 1. Test Conditions
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2241 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INJ. PUMP CALIBRATION DATA
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2242 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 3. Governor adjustment
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2243 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: TURBOCHARGER - TURBOCHARGER CHECKING PROCEDURES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2244 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 9–6 TURBOCHARGER - IRREGULAR ACCELERATION, INSUFFICIENT OUTPUT
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2245 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ELECTRICALS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2246 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: STARTER - MAIN DATA AND SPECIFICATIONS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2247 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ELECTRICALS - Disassembly of Gear Case and Center Bracket
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2248 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Brush
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2249 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ADJUSTMENT - Size, L, of Pinion Pop-up with Magnetic Switch
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2250 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MAIN DATA AND SPECIFICATIONS - ALTERNATOR
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2251 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: STRUCTURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2252 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ENGINE ELECTRICALS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2253 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REASSEMBLY
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2254 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: FAULT FINDING
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2255 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: HARD STARTING - 1) STARTER INOPERATIVE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2256 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: HARD STARTING - 3) ENGINE TURNS OVER BUT DOES NOT START
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2257 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: UNSTABLE LOW IDLING
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2258 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: INSUFFICIENT POWER
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2259 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EXCESSIVE FUEL CONSUMPTION
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2260 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: EXCESSIVE OIL CONSUMPTION
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2261 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: WHITE EXHAUST SMOKE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2262 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: OIL PRESSURE DOES NOT RISE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2263 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ABNORMAL ENGINE NOISE - 2. Gas Leakage Noise
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2264 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ABNORMAL ENGINE NOISE - 4. Slapping Noise
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2265 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: SPECIAL TOOL LIST
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2266 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2267 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2268 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2269 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2270 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2271 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2272 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2273 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2274 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2275 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2276 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2277 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2278 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2279 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2280 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: REPAIR STANDARDS - GENERAL RULES
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2281 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2282 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2283 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2284 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2285 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–2 CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2286 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–2 CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2287 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–2 CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2288 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–2 CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2289 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–2 CONVERSION TABLE - LENGTH
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2290 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–3 - AREA
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2291 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–3 - AREA
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2292 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–3 - VOLUME
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2293 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–3 - VOLUME
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2294 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–4 CONVERSION TABLE - VOLUME
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2295 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–4 CONVERSION TABLE - VOLUME
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2296 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–4 CONVERSION TABLE - VOLUME
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2297 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–4 CONVERSION TABLE - VOLUME
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2298 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–4 CONVERSION TABLE - VOLUME
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2299 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MASS - POUNDS TO KILOGRAMS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2300 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MASS - POUNDS TO KILOGRAMS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2301 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MASS - KILOGRAMS TO POUNDS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2302 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MASS - KILOGRAMS TO NEWTON
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2303 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: MASS - NEWTON TO KILOGRAMS
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2304 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–6 CONVERSION TABLE - PRESSURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2305 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–6 CONVERSION TABLE - PRESSURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2306 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–6 CONVERSION TABLE - PRESSURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2307 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–6 CONVERSION TABLE - PRESSURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2308 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–6 CONVERSION TABLE - PRESSURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2309 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–7 - TORQUE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2310 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–7 - TORQUE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2311 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–7 - TORQUE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2312 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–7 - TORQUE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2313 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: CONVERSION TABLE 14–7 - TORQUE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2314 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–8 CONVERSION TABLE - TEMPERATURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2315 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–8 CONVERSION TABLE - TEMPERATURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2316 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–8 CONVERSION TABLE - TEMPERATURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2317 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–8 CONVERSION TABLE - TEMPERATURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2318 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–8 CONVERSION TABLE - TEMPERATURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2319 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–8 CONVERSION TABLE - TEMPERATURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2320 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–8 CONVERSION TABLE - TEMPERATURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2321 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: 14–8 CONVERSION TABLE - TEMPERATURE
Model: ZX138MF-5G
Kategori: ENGINE MANUAL

$hdr$ || content where id = 2322 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: ZAXIS 138MF-5G - SALES MANUAL
Model: ZX138MF-5G
Kategori: SALES MANUAL

$hdr$ || content where id = 2325 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Overview of ZAXIS-5G Series - Walk Around (Major Improvements)
Model: ZX138MF-5G
Kategori: SALES MANUAL

$hdr$ || content where id = 2326 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Chapter 1 Performance - 1 Machine Performance
Model: ZX138MF-5G
Kategori: SALES MANUAL

$hdr$ || content where id = 2327 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Chapter 1 Performance - 1 Machine Performance
Model: ZX138MF-5G
Kategori: SALES MANUAL

$hdr$ || content where id = 2328 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Chapter 1 Performance - 2 Hydraulic System and Digging/Lifting Performance
Model: ZX138MF-5G
Kategori: SALES MANUAL

$hdr$ || content where id = 2329 and content !~ '^\s*(Section|Chapter):';
update documents set content = $hdr$Section: Chapter 1 Performance - 3 Traveling Performance
Model: ZX138MF-5G
Kategori: SALES MANUAL

$hdr$ || content where id = 2330 and content !~ '^\s*(Section|Chapter):';
commit;
