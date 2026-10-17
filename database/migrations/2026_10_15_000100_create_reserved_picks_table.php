<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The reserved pick: one person, named by ticket number and name, who
     * never comes up in a random draw. They win only when the operator arms
     * the pick for a raffle; that raffle's next draw lands on them, and the
     * pick disarms itself afterwards.
     */
    public function up(): void
    {
        Schema::create('reserved_picks', function (Blueprint $table) {
            $table->id();
            $table->string('name', 160)->nullable();
            $table->string('ticket_number', 64)->nullable();
            $table->foreignId('armed_raffle_id')->nullable()->constrained('raffles')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reserved_picks');
    }
};
