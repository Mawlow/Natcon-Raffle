<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** An optional company logo shown on the raffle's draw screen, by catalogue id. */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->string('logo', 160)->nullable()->after('prize_currency');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('logo');
        });
    }
};
