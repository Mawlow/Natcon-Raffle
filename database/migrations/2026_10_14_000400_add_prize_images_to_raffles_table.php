<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A photo for each prize, shown on the screens beside the prize's name:
     * {"Brand New Car": "prize-images/12/abc.jpg", ...}, keyed by the prize
     * name as the screens show it, so it works for a raffle's own prize,
     * each prize of a prize list and each prize on a pre-selected list.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->json('prize_images')->nullable()->after('logo_right');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('prize_images');
        });
    }
};
